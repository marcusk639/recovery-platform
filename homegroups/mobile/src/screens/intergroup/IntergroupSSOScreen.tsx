import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import functions from '@react-native-firebase/functions';
import {IntergroupStackParamList} from '../../types/navigation';
import {useAppSelector} from '../../store';
import {
  selectIntergroup,
  selectAffiliatedGroups,
} from '../../store/slices/intergroupSlice';

type Route = RouteProp<IntergroupStackParamList, 'IntergroupSSO'>;
type Nav = StackNavigationProp<IntergroupStackParamList, 'IntergroupSSO'>;

const IntergroupSSOScreen: React.FC = () => {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const {intergroupId} = route.params;

  const intergroup = useAppSelector(selectIntergroup);
  const affiliatedGroups = useAppSelector(selectAffiliatedGroups);

  const [domains, setDomains] = useState<string[]>(
    intergroup?.emailDomains || [],
  );
  const [newDomain, setNewDomain] = useState('');
  const [autoJoinGroupId, setAutoJoinGroupId] = useState(
    intergroup?.ssoAutoJoinGroupId || '',
  );
  const [enabled, setEnabled] = useState(intergroup?.ssoEnabled ?? false);
  const [saving, setSaving] = useState(false);

  const isTierB = intergroup?.tier === 'tier_b';

  const addDomain = () => {
    const trimmed = newDomain.trim().toLowerCase();
    if (!trimmed) return;
    if (domains.includes(trimmed)) {
      Alert.alert('Error', 'Domain already added');
      return;
    }
    if (domains.length >= 5) {
      Alert.alert('Error', 'Maximum 5 domains allowed');
      return;
    }
    setDomains([...domains, trimmed]);
    setNewDomain('');
  };

  const removeDomain = (domain: string) => {
    setDomains(domains.filter(d => d !== domain));
  };

  const handleSave = async () => {
    if (!autoJoinGroupId) {
      Alert.alert('Error', 'Please select a group for auto-join');
      return;
    }
    setSaving(true);
    try {
      await functions().httpsCallable('configureSSO')({
        intergroupId,
        emailDomains: domains,
        autoJoinGroupId,
        enabled,
      });
      Alert.alert('Success', 'SSO settings saved successfully');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save SSO settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Tier lock for tier_a */}
      {!isTierB && (
        <View style={styles.lockBanner}>
          <Text style={styles.lockTitle}>Unlimited Plan Required</Text>
          <Text style={styles.lockText}>
            SSO is only available on the Unlimited (Tier B) plan. Upgrade to
            enable automatic sign-in.
          </Text>
        </View>
      )}

      {/* How it works */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>How it works</Text>
        <Text style={styles.descText}>
          When a new member signs up with an email from your organization's
          domain, they're automatically added to your designated group. No
          invite codes needed.
        </Text>
      </View>

      {/* Email Domains */}
      <View style={[styles.section, !isTierB && styles.sectionDisabled]}>
        <Text style={styles.sectionTitle}>Email Domains</Text>
        {domains.map(domain => (
          <View key={domain} style={styles.domainRow}>
            <Text style={styles.domainText}>{domain}</Text>
            <TouchableOpacity
              onPress={() => removeDomain(domain)}
              disabled={!isTierB}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))}
        {domains.length < 5 && (
          <View style={styles.addDomainRow}>
            <TextInput
              style={styles.domainInput}
              value={newDomain}
              onChangeText={setNewDomain}
              placeholder="company.org"
              autoCapitalize="none"
              keyboardType="url"
              editable={isTierB}
            />
            <TouchableOpacity
              style={[styles.addButton, !isTierB && styles.addButtonDisabled]}
              onPress={addDomain}
              disabled={!isTierB}>
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Auto-Join Group */}
      <View style={[styles.section, !isTierB && styles.sectionDisabled]}>
        <Text style={styles.sectionTitle}>Auto-Join Group</Text>
        {affiliatedGroups.map(group => (
          <TouchableOpacity
            key={group.id}
            style={[
              styles.groupOption,
              autoJoinGroupId === group.id && styles.groupOptionSelected,
            ]}
            onPress={() => isTierB && setAutoJoinGroupId(group.id!)}
            disabled={!isTierB}>
            <Text style={styles.groupOptionText}>{group.name}</Text>
            <Text style={styles.groupOptionMeta}>
              {group.memberCount} members
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Enable Toggle */}
      <View style={[styles.section, !isTierB && styles.sectionDisabled]}>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>SSO Enabled</Text>
          <Switch
            value={enabled}
            onValueChange={val => {
              if (isTierB) setEnabled(val);
            }}
            disabled={!isTierB}
            trackColor={{false: '#e0e0e0', true: '#2196F3'}}
          />
        </View>
      </View>

      {/* Save Button */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[
            styles.saveButton,
            (!isTierB || saving) && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!isTierB || saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f5'},
  lockBanner: {
    margin: 16,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FFB74D',
  },
  lockTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E65100',
    marginBottom: 6,
  },
  lockText: {fontSize: 13, color: '#E65100'},
  section: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    borderRadius: 8,
    padding: 16,
    elevation: 1,
  },
  sectionDisabled: {opacity: 0.5},
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  descText: {fontSize: 14, color: '#555', lineHeight: 20},
  domainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  domainText: {fontSize: 14, color: '#1a1a1a'},
  removeText: {fontSize: 13, color: '#f44336'},
  addDomainRow: {flexDirection: 'row', marginTop: 10, gap: 8},
  domainInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
  },
  addButton: {
    backgroundColor: '#2196F3',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  addButtonDisabled: {backgroundColor: '#90CAF9'},
  addButtonText: {color: '#fff', fontWeight: '600'},
  groupOption: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    marginBottom: 8,
  },
  groupOptionSelected: {borderColor: '#2196F3', backgroundColor: '#E3F2FD'},
  groupOptionText: {fontSize: 14, fontWeight: '600', color: '#1a1a1a'},
  groupOptionMeta: {fontSize: 12, color: '#666'},
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleLabel: {fontSize: 15, color: '#1a1a1a', fontWeight: '600'},
  actions: {margin: 16, marginTop: 0},
  saveButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: {backgroundColor: '#90CAF9'},
  saveButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
});

export default IntergroupSSOScreen;
