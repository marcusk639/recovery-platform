/**
 * Every icon name the app renders exists in the installed icon packages.
 *
 * React Native 0.88 upgrade, Task 5: the icons move from react-native-vector-icons 9 to the
 * per-family @react-native-vector-icons 14 packages. Ionicons 7 dropped the md-/ios- aliases,
 * and an unknown name renders a blank or "?" glyph with only a console warning, so this scans
 * the source (TypeScript AST) instead of trusting the type checker.
 *
 * - Literal names, including both arms of a literal ternary and ClickableIcon's iconProps.name,
 *   must exist in that family's v14 glyph map. FontAwesome5 accepts a glyph from any of its
 *   styles: RatsFontAwesome5 picks the style the way react-native-vector-icons 9 did.
 * - Dynamic names come from data elsewhere and are pinned below after review. FontAwesome5's
 *   v9 and v14 glyph sets are identical (except one unused brand icon), so its dynamic names
 *   cannot regress; a new dynamic site makes this test fail until it is reviewed.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

type Family = 'fa5' | 'ion' | 'mat';

const SRC = path.join(__dirname, '..', '..');
const glyphs = (pkg: string, file: string): Set<string> =>
  new Set(Object.keys(require(`@react-native-vector-icons/${pkg}/glyphmaps/${file}`)));
const FA5_META = require('@react-native-vector-icons/fontawesome5/glyphmaps/FontAwesome5_meta.json');
const KNOWN: Record<Family, Set<string>> = {
  fa5: new Set<string>([...FA5_META.brand, ...FA5_META.regular, ...FA5_META.solid]),
  ion: glyphs('ionicons', 'Ionicons.json'),
  mat: glyphs('material-icons', 'MaterialIcons.json'),
};

/** Module specifier → family, for the old (v9) and new (v14 / app wrapper) imports. */
const FAMILY_BY_MODULE: Array<[RegExp, Family]> = [
  [/(react-native-vector-icons\/FontAwesome5|@react-native-vector-icons\/fontawesome5(\/static)?|(^|\/)font-awesome-5)$/, 'fa5'],
  [/(react-native-vector-icons\/Ionicons|@react-native-vector-icons\/ionicons(\/static)?)$/, 'ion'],
  [/(react-native-vector-icons\/MaterialIcons|@react-native-vector-icons\/material-icons(\/static)?)$/, 'mat'],
];

/** Reviewed 2026-10-30: each resolves to FontAwesome5 names held in data or props. */
const REVIEWED_DYNAMIC = new Set([
  'components/action-button/index.tsx|props.iconName',
  'components/containerized-button/index.tsx|iconName',
  'components/empty-screen/index.tsx|icon',
  'components/rats-icon/boxed-icon.tsx|name',
  'components/rats-icon/faces.tsx|name || \'\'',
  'components/rats-icon/rats-icon.tsx|props.name || \'\'',
  'components/rats-interactable-section/index.tsx|iconName',
  'components/rats-search-filter/index.tsx|iconName',
  'components/rats-stat-card/index.tsx|iconName',
  'components/rats-step-indicator/index.tsx|index < currentPosition ? \'check\' : label.icon',
  'navigation/navigators.tsx|iconName',
  'screens/DirectChat/BaseChat.tsx|iconName',
  'screens/HouseOverview/HouseActivity/HouseActivity.tsx|iconDef.name',
  'screens/HouseOverview/HouseSummary/HouseSummary.tsx|HEALTH_ICON_MAP[health]',
  'screens/HouseSearch/HouseSearchScreen.tsx|HEALTH_ICON_MAP[HealthConstants.SAD]',
  'screens/HouseSettings/StripeSettingsScreen.tsx|cfg.icon',
  'screens/HouseSettings/StripeSettingsScreen.tsx|b.icon',
  'screens/IntroHouseSummary/IntroHouseSummary.tsx|ATTRIBUTES[value].icon',
  'screens/Notifications/Notifications.tsx|icon',
  'screens/Personal/Personal.tsx|option.icon',
  'screens/Profile/GuestHome.tsx|iconName',
  'screens/Profile/GuestHome.tsx|HEALTH_ICON_MAP[health]',
  'screens/SubscriptionUpdateModal/SubscriptionUpdateModal.tsx|copy.icon',
]);

interface Site {
  file: string;
  family: Family;
  literals: string[] | null;
  expression: string;
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

/** String literals an expression can evaluate to, or null when it depends on data. */
function literalsOf(node: ts.Node | undefined): string[] | null {
  if (!node) return null;
  if (ts.isJsxExpression(node) || ts.isParenthesizedExpression(node)) return literalsOf(node.expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isConditionalExpression(node)) {
    const a = literalsOf(node.whenTrue);
    const b = literalsOf(node.whenFalse);
    return a && b ? [...a, ...b] : null;
  }
  return null;
}

function scan(): Site[] {
  const sites: Site[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    if (!/vector-icons|RatsIcon|ClickableIcon|font-awesome-5/.test(text)) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    const tags: Record<string, Family | 'clickable'> = {};
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !st.importClause) continue;
      const mod = (st.moduleSpecifier as ts.StringLiteral).text;
      const family = FAMILY_BY_MODULE.find(([re]) => re.test(mod))?.[1];
      const clause = st.importClause;
      const named = clause.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : [];
      if (family && clause.name) tags[clause.name.text] = family;
      named.forEach((el) => {
        const imported = (el.propertyName || el.name).text;
        if (family) tags[el.name.text] = family;
        if (/rats-icon/.test(mod) && imported === 'RatsIcon') tags[el.name.text] = 'fa5';
        if (/rats-icon/.test(mod) && imported === 'ClickableIcon') tags[el.name.text] = 'clickable';
      });
    }
    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const kind = tags[node.tagName.getText(sf)];
        const attr = (name: string) =>
          node.attributes.properties.find(
            (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(sf) === name,
          );
        let expr: ts.Node | undefined;
        if (kind === 'clickable') {
          const obj = attr('iconProps')?.initializer;
          const inner = obj && ts.isJsxExpression(obj) ? obj.expression : undefined;
          const prop = inner && ts.isObjectLiteralExpression(inner)
            ? inner.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'name')
            : undefined;
          expr = prop?.initializer;
        } else if (kind) {
          expr = attr('name')?.initializer;
        }
        if (kind && expr) {
          const inner = ts.isJsxExpression(expr) && expr.expression ? expr.expression : expr;
          sites.push({
            file: rel,
            family: kind === 'clickable' ? 'fa5' : kind,
            literals: literalsOf(expr),
            expression: inner.getText(sf).replace(/\s+/g, ' ').trim(),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return sites;
}

const SITES = scan();

describe('icon names', () => {
  it('finds the icon sites (guards the scanner itself)', () => {
    expect(SITES.length).toBeGreaterThan(90);
    expect(SITES.some((s) => s.family === 'ion')).toBe(true);
    expect(SITES.some((s) => s.family === 'mat')).toBe(true);
  });

  it('uses only names that exist in the installed icon packages', () => {
    const unknown = SITES.flatMap((s) =>
      (s.literals ?? []).filter((n) => !KNOWN[s.family].has(n)).map((n) => `${s.file}: ${s.family} "${n}"`),
    );
    expect(unknown).toEqual([]);
  });

  it('has reviewed every dynamic icon name', () => {
    const dynamic = SITES.filter((s) => s.literals === null).map((s) => `${s.file}|${s.expression}`);
    expect(dynamic.filter((d) => !REVIEWED_DYNAMIC.has(d))).toEqual([]);
    expect([...REVIEWED_DYNAMIC].filter((d) => !dynamic.includes(d))).toEqual([]);
  });
});
