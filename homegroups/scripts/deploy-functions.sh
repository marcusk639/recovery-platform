#!/bin/bash

# =============================================================================
# Cloud Functions Smart Deployment Script
# =============================================================================
# Intelligently deploys only modified Firebase Cloud Functions to avoid
# Cloud Run quota limits and speed up deployments.
#
# Usage:
#   ./deploy-functions.sh              # Deploy only changed functions
#   ./deploy-functions.sh --all        # Deploy all functions in batches
#   ./deploy-functions.sh --list       # List all detected functions
#   ./deploy-functions.sh --changed    # List only changed functions
#   ./deploy-functions.sh --batch 3    # Deploy specific batch (1-N)
#   ./deploy-functions.sh --from 2     # Deploy from batch N to end
#   ./deploy-functions.sh --dry-run    # Show what would be deployed
#   ./deploy-functions.sh --only fn1,fn2,fn3  # Deploy specific functions
#   ./deploy-functions.sh --force      # Force deploy all (ignore cache)
# =============================================================================

set -e

# Configuration
BATCH_SIZE=5          # Functions per batch (adjust based on quota)
DELAY_SECONDS=90      # Wait time between batches
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUNCTIONS_DIR="$PROJECT_DIR/functions/src"
INDEX_FILE="$FUNCTIONS_DIR/index.ts"
DEPLOY_CACHE_FILE="$PROJECT_DIR/.deploy-cache"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# =============================================================================
# Function Detection
# =============================================================================

# Parse functions from index.ts and return function name -> file path mapping
parse_functions() {
    if [ ! -f "$INDEX_FILE" ]; then
        echo -e "${RED}Error: Cannot find $INDEX_FILE${NC}" >&2
        exit 1
    fi
    
    # Extract all export statements and parse function names
    grep -E "^export \{" "$INDEX_FILE" | \
        sed 's/export {//g' | \
        sed 's/} from.*//g' | \
        tr ',' '\n' | \
        sed 's/^[[:space:]]*//g' | \
        sed 's/[[:space:]]*$//g' | \
        grep -v "^//" | \
        grep -v "^$" | \
        sort
}

# Get file path for a function name by parsing index.ts
get_function_file() {
    local func_name=$1
    
    # Find the line with this function and extract the file path
    local file_path=$(grep -E "export \{[^}]*${func_name}[^}]*\} from" "$INDEX_FILE" | \
        sed 's/.*from ["'"'"']\([^"'"'"']*\)["'"'"'].*/\1/' | \
        head -1)
    
    if [ -n "$file_path" ]; then
        # Convert relative path to absolute
        echo "$FUNCTIONS_DIR/${file_path#./}.ts"
    fi
}

# Get all functions as array
get_all_functions() {
    local functions=()
    while IFS= read -r func; do
        functions+=("$func")
    done < <(parse_functions)
    echo "${functions[@]}"
}

# =============================================================================
# Change Detection
# =============================================================================

# Get the last deployment commit hash
get_last_deploy_commit() {
    if [ -f "$DEPLOY_CACHE_FILE" ]; then
        cat "$DEPLOY_CACHE_FILE"
    else
        echo ""
    fi
}

# Save the current commit as the last deployment
save_deploy_commit() {
    git -C "$PROJECT_DIR" rev-parse HEAD > "$DEPLOY_CACHE_FILE"
    echo -e "${GREEN}Saved deployment commit to cache${NC}"
}

# Get list of changed files since last deployment
get_changed_files() {
    local last_commit=$(get_last_deploy_commit)
    
    if [ -z "$last_commit" ]; then
        # No previous deployment, consider all files as changed
        echo -e "${YELLOW}No previous deployment found. Will check all function files.${NC}" >&2
        git -C "$PROJECT_DIR" ls-files "$FUNCTIONS_DIR"
    else
        # Get files changed since last deployment
        git -C "$PROJECT_DIR" diff --name-only "$last_commit" HEAD -- "$FUNCTIONS_DIR" 2>/dev/null || \
        git -C "$PROJECT_DIR" ls-files "$FUNCTIONS_DIR"
    fi
}

# Check if a function's source file has changed
is_function_changed() {
    local func_name=$1
    local func_file=$(get_function_file "$func_name")
    local changed_files=$(get_changed_files)
    
    if [ -z "$func_file" ]; then
        # Can't determine file, assume changed
        return 0
    fi
    
    # Convert to relative path for comparison
    local rel_path="${func_file#$PROJECT_DIR/}"
    
    # Check if the function's file is in the changed list
    if echo "$changed_files" | grep -q "$rel_path"; then
        return 0  # Changed
    fi
    
    # Also check shared utilities that would affect all functions
    local shared_files=("functions/src/utils/firebase.ts" "functions/src/utils/stripe.ts" "functions/src/utils/email.ts" "functions/package.json")
    for shared in "${shared_files[@]}"; do
        if echo "$changed_files" | grep -q "$shared"; then
            return 0  # Shared file changed, redeploy all
        fi
    done
    
    return 1  # Not changed
}

# Get list of changed functions
get_changed_functions() {
    local all_funcs
    read -ra all_funcs <<< "$(get_all_functions)"
    local changed_funcs=()
    local changed_files=$(get_changed_files)
    
    # Check if shared files changed (would require all functions to redeploy)
    local shared_changed=false
    local shared_files=("functions/src/utils/firebase.ts" "functions/src/utils/stripe.ts" "functions/src/utils/email.ts" "functions/package.json" "functions/src/index.ts")
    for shared in "${shared_files[@]}"; do
        if echo "$changed_files" | grep -q "$shared"; then
            shared_changed=true
            echo -e "${YELLOW}Shared file changed: $shared - all functions need redeployment${NC}" >&2
            break
        fi
    done
    
    if [ "$shared_changed" = true ]; then
        echo "${all_funcs[@]}"
        return
    fi
    
    # Check each function
    for func in "${all_funcs[@]}"; do
        local func_file=$(get_function_file "$func")
        if [ -n "$func_file" ]; then
            local rel_path="${func_file#$PROJECT_DIR/}"
            if echo "$changed_files" | grep -q "$rel_path"; then
                changed_funcs+=("$func")
            fi
        fi
    done
    
    echo "${changed_funcs[@]}"
}

# =============================================================================
# Deployment Functions
# =============================================================================

# Deploy a batch of functions
deploy_batch() {
    local batch_num=$1
    local dry_run=$2
    shift 2
    local functions=("$@")
    
    if [ ${#functions[@]} -eq 0 ]; then
        echo -e "${YELLOW}Batch ${batch_num} is empty, skipping${NC}"
        return 0
    fi
    
    # Build the functions string
    local functions_list=""
    for func in "${functions[@]}"; do
        if [ -z "$functions_list" ]; then
            functions_list="functions:${func}"
        else
            functions_list="${functions_list},functions:${func}"
        fi
    done
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Batch ${batch_num}: ${#functions[@]} functions${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    for func in "${functions[@]}"; do
        echo "  • ${func}"
    done
    echo ""
    
    if [ "$dry_run" = true ]; then
        echo -e "${YELLOW}[DRY RUN] Would execute: firebase deploy --only ${functions_list}${NC}"
        return 0
    fi
    
    echo -e "${GREEN}Deploying...${NC}"
    
    cd "$PROJECT_DIR"
    if firebase deploy --only "$functions_list"; then
        echo -e "${GREEN}✓ Batch ${batch_num} deployed successfully${NC}"
        return 0
    else
        echo -e "${RED}✗ Batch ${batch_num} failed${NC}"
        return 1
    fi
}

# Wait between batches with countdown
wait_between_batches() {
    local seconds=$1
    local countdown
    echo ""
    echo -e "${YELLOW}Waiting ${seconds} seconds before next batch (quota cooldown)...${NC}"

    for ((countdown=seconds; countdown>0; countdown--)); do
        printf "\r${YELLOW}  %d seconds remaining...${NC}  " $countdown
        sleep 1
    done
    printf "\r${GREEN}  Ready for next batch!          ${NC}\n"
    echo ""
}

# =============================================================================
# Display Functions
# =============================================================================

# Print usage
print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Smart Deployment (default):"
    echo "  $0                    Deploy only functions changed since last deployment"
    echo ""
    echo "Options:"
    echo "  --all           Deploy all functions in batches (ignore changes)"
    echo "  --force         Force deploy all (same as --all, clears cache)"
    echo "  --changed       List only changed functions and exit"
    echo "  --list          List all detected functions and exit"
    echo "  --batch N       Deploy specific batch number"
    echo "  --from N        Deploy from batch N to end"
    echo "  --only f1,f2    Deploy only specific functions (comma-separated)"
    echo "  --size N        Functions per batch (default: ${BATCH_SIZE})"
    echo "  --delay N       Seconds to wait between batches (default: ${DELAY_SECONDS})"
    echo "  --dry-run       Show what would be deployed without deploying"
    echo "  --help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Smart deploy (only changed)"
    echo "  $0 --changed                          # See what would be deployed"
    echo "  $0 --dry-run                          # Preview deployment"
    echo "  $0 --all                              # Deploy everything"
    echo "  $0 --force                            # Force full redeploy"
    echo "  $0 --only stripeWebhook,banUser       # Deploy specific functions"
    echo "  $0 --size 3 --delay 120               # Custom batch size and delay"
}

# List all functions grouped into batches
list_functions() {
    local all_funcs
    read -ra all_funcs <<< "$(get_all_functions)"
    local total=${#all_funcs[@]}
    local num_batches=$(( (total + BATCH_SIZE - 1) / BATCH_SIZE ))
    
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║          Detected Cloud Functions (${total} total)              ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}Source: functions/src/index.ts${NC}"
    echo -e "${CYAN}Batch size: ${BATCH_SIZE} functions${NC}"
    echo -e "${CYAN}Total batches: ${num_batches}${NC}"
    echo ""
    
    local batch_num=1
    local count=0
    
    echo -e "${BLUE}━━━ Batch ${batch_num} ━━━${NC}"
    
    for func in "${all_funcs[@]}"; do
        if [ $count -ge $BATCH_SIZE ]; then
            batch_num=$((batch_num + 1))
            count=0
            echo ""
            echo -e "${BLUE}━━━ Batch ${batch_num} ━━━${NC}"
        fi
        echo "  • ${func}"
        count=$((count + 1))
    done
    
    echo ""
}

# List only changed functions
list_changed_functions() {
    local last_commit=$(get_last_deploy_commit)
    
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║               Changed Functions Analysis                   ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    if [ -z "$last_commit" ]; then
        echo -e "${YELLOW}No previous deployment recorded.${NC}"
        echo -e "${CYAN}All functions will be deployed on first run.${NC}"
        echo -e "${CYAN}Run a deployment to establish baseline.${NC}"
    else
        local short_commit="${last_commit:0:8}"
        local current_commit=$(git -C "$PROJECT_DIR" rev-parse --short HEAD)
        echo -e "${CYAN}Last deployment: ${short_commit}${NC}"
        echo -e "${CYAN}Current HEAD:    ${current_commit}${NC}"
        echo ""
    fi
    
    local changed_funcs
    read -ra changed_funcs <<< "$(get_changed_functions)"
    local total=${#changed_funcs[@]}
    
    if [ $total -eq 0 ]; then
        echo -e "${GREEN}✓ No functions have changed since last deployment!${NC}"
        echo ""
        return
    fi
    
    echo -e "${MAGENTA}Changed functions (${total}):${NC}"
    echo ""
    for func in "${changed_funcs[@]}"; do
        local func_file=$(get_function_file "$func")
        local rel_path="${func_file#$PROJECT_DIR/}"
        echo -e "  • ${CYAN}${func}${NC}"
        echo -e "    └─ ${rel_path}"
    done
    echo ""
}

# Deploy specific functions
deploy_specific() {
    local dry_run=$1
    shift
    local functions_str=$1
    
    # Convert comma-separated to array
    IFS=',' read -ra functions <<< "$functions_str"
    
    echo -e "${BLUE}Deploying ${#functions[@]} specific functions${NC}"
    deploy_batch 1 "$dry_run" "${functions[@]}"
}

# =============================================================================
# Main Function
# =============================================================================

main() {
    local mode="smart"  # Default to smart deployment
    local specific_batch=0
    local from_batch=1
    local dry_run=false
    local specific_functions=""
    local force=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --smart)
                mode="smart"
                shift
                ;;
            --all)
                mode="all"
                shift
                ;;
            --force)
                mode="all"
                force=true
                shift
                ;;
            --list)
                mode="list"
                shift
                ;;
            --changed)
                mode="changed"
                shift
                ;;
            --batch)
                mode="batch"
                specific_batch=$2
                shift 2
                ;;
            --from)
                mode="from"
                from_batch=$2
                shift 2
                ;;
            --only)
                mode="specific"
                specific_functions=$2
                shift 2
                ;;
            --size)
                BATCH_SIZE=$2
                shift 2
                ;;
            --delay)
                DELAY_SECONDS=$2
                shift 2
                ;;
            --dry-run)
                dry_run=true
                shift
                ;;
            --help|-h)
                print_usage
                exit 0
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                print_usage
                exit 1
                ;;
        esac
    done
    
    # Handle list modes early
    if [ "$mode" = "list" ]; then
        list_functions
        exit 0
    fi
    
    if [ "$mode" = "changed" ]; then
        list_changed_functions
        exit 0
    fi
    
    # Clear cache if forcing
    if [ "$force" = true ] && [ -f "$DEPLOY_CACHE_FILE" ]; then
        rm "$DEPLOY_CACHE_FILE"
        echo -e "${YELLOW}Cleared deployment cache${NC}"
    fi
    
    # Determine which functions to deploy
    local funcs_to_deploy=()
    
    if [ "$mode" = "smart" ]; then
        # Smart mode: only deploy changed functions
        read -ra funcs_to_deploy <<< "$(get_changed_functions)"
        
        if [ ${#funcs_to_deploy[@]} -eq 0 ]; then
            echo ""
            echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
            echo -e "${GREEN}║           No Changes Detected - Nothing to Deploy          ║${NC}"
            echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
            echo ""
            echo -e "${CYAN}All functions are up to date with the last deployment.${NC}"
            echo -e "${CYAN}Use --all or --force to deploy everything anyway.${NC}"
            echo ""
            exit 0
        fi
        
        echo ""
        echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║         Smart Deployment - Changed Functions Only          ║${NC}"
        echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${CYAN}Detected ${#funcs_to_deploy[@]} changed functions${NC}"
    else
        # All mode or batch mode: use all functions
        read -ra funcs_to_deploy <<< "$(get_all_functions)"
        
        echo ""
        echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║       Cloud Functions Batch Deployment Script              ║${NC}"
        echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
        echo ""
    fi
    
    local total=${#funcs_to_deploy[@]}
    local num_batches=$(( (total + BATCH_SIZE - 1) / BATCH_SIZE ))
    
    echo -e "${CYAN}Deploying ${total} functions in ${num_batches} batches (${BATCH_SIZE} per batch)${NC}"
    echo ""
    
    if [ "$dry_run" = true ]; then
        echo -e "${YELLOW}>>> DRY RUN MODE - No changes will be made <<<${NC}"
        echo ""
    fi
    
    case $mode in
        specific)
            deploy_specific "$dry_run" "$specific_functions"
            ;;
        batch)
            if [ $specific_batch -lt 1 ] || [ $specific_batch -gt $num_batches ]; then
                echo -e "${RED}Invalid batch number: ${specific_batch}. Must be 1-${num_batches}${NC}"
                exit 1
            fi
            
            local start_idx=$(( (specific_batch - 1) * BATCH_SIZE ))
            local batch_funcs=("${funcs_to_deploy[@]:$start_idx:$BATCH_SIZE}")
            
            echo -e "${BLUE}Deploying batch ${specific_batch} of ${num_batches}${NC}"
            echo ""
            deploy_batch $specific_batch "$dry_run" "${batch_funcs[@]}"
            ;;
        from)
            if [ $from_batch -lt 1 ] || [ $from_batch -gt $num_batches ]; then
                echo -e "${RED}Invalid batch number: ${from_batch}. Must be 1-${num_batches}${NC}"
                exit 1
            fi
            
            echo -e "${BLUE}Deploying batches ${from_batch} through ${num_batches}${NC}"
            echo ""
            
            for ((i=from_batch; i<=num_batches; i++)); do
                local start_idx=$(( (i - 1) * BATCH_SIZE ))
                local batch_funcs=("${funcs_to_deploy[@]:$start_idx:$BATCH_SIZE}")
                
                deploy_batch $i "$dry_run" "${batch_funcs[@]}"
                
                if [ $? -ne 0 ]; then
                    echo -e "${RED}Deployment failed at batch ${i}. Stopping.${NC}"
                    echo -e "${YELLOW}Resume with: $0 --from ${i}${NC}"
                    exit 1
                fi
                
                if [ $i -lt $num_batches ] && [ "$dry_run" = false ]; then
                    wait_between_batches $DELAY_SECONDS
                fi
            done
            ;;
        smart|all)
            echo -e "${BLUE}Deploying ${num_batches} batches${NC}"
            echo ""
            
            for ((i=1; i<=num_batches; i++)); do
                local start_idx=$(( (i - 1) * BATCH_SIZE ))
                local batch_funcs=("${funcs_to_deploy[@]:$start_idx:$BATCH_SIZE}")
                
                deploy_batch $i "$dry_run" "${batch_funcs[@]}"
                
                if [ $? -ne 0 ]; then
                    echo -e "${RED}Deployment failed at batch ${i}. Stopping.${NC}"
                    echo -e "${YELLOW}Resume with: $0 --from ${i}${NC}"
                    exit 1
                fi
                
                if [ $i -lt $num_batches ] && [ "$dry_run" = false ]; then
                    wait_between_batches $DELAY_SECONDS
                fi
            done
            ;;
    esac
    
    # Save deployment commit on success (unless dry run)
    if [ "$dry_run" = false ]; then
        save_deploy_commit
    fi
    
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                    Deployment Complete!                    ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Run main
main "$@"
