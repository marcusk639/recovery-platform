const { imeTop, iosKeyboardTop, targetBounds, coveredBy } = require('../check-keyboard');

const node = (attributes, children = []) => ({ attributes, children });

describe('check-keyboard', () => {
  it('reads the visible keyboard top from dumpsys (API 34 and API 36 formats)', () => {
    expect(
      imeTop(
        'InsetsSource id=1 type=ime frame=[0,1480][1080,2400] visible=true flags= sideHint=BOTTOM',
      ),
    ).toBe(1480);
    expect(
      imeTop(
        'InsetsSource id=3 type=ime frame=[0,1517][1080,2400] visibleFrame=[0,1517][1080,2400] visible=true flags=',
      ),
    ).toBe(1517);
    expect(imeTop('InsetsSource type=ITYPE_IME frame=[0,1400][1080,2274] visible=true')).toBe(1400);
  });

  it('reports no keyboard when the ime source is hidden', () => {
    expect(
      imeTop('InsetsSource id=1 type=ime frame=[0,1480][1080,2400] visible=false flags='),
    ).toBeNull();
  });

  it('puts the iOS keyboard top at its toolbar', () => {
    const tree = node({ bounds: '[0,0][402,874]' }, [
      node({ text: 'Next', 'resource-id': 'keyboard.toolbar.next', bounds: '[64,499][104,529]' }),
      node({ text: 'Done', 'resource-id': 'keyboard.toolbar.done', bounds: '[332,505][370,523]' }),
      node({ text: 'q', bounds: '[4,597][44,651]' }),
      node({ text: 'space', 'resource-id': 'space', bounds: '[103,759][300,813]' }),
    ]);
    expect(iosKeyboardTop(tree)).toBe(499);
  });

  it('falls back to the highest key, number pads included', () => {
    const tree = node({ bounds: '[0,0][402,874]' }, [
      node({ text: '1', bounds: '[4,620][134,670]' }),
      node({ text: 'delete', 'resource-id': 'delete', bounds: '[268,780][402,830]' }),
    ]);
    expect(iosKeyboardTop(tree)).toBe(780);
    expect(iosKeyboardTop(node({ bounds: '[0,0][402,874]' }))).toBeNull();
  });

  it('finds the target field by testID, by text, or by focus', () => {
    const tree = node({ bounds: '[0,0][402,874]' }, [
      node({ 'resource-id': 'chat-composer', bounds: '[10,560][390,600]' }),
      node({ text: '33.33', bounds: '[20,300][380,340]' }),
      node({ focused: 'true', bounds: '[20,100][380,140]' }),
    ]);
    expect(targetBounds(tree, { id: 'chat-composer' })).toEqual({
      x1: 10,
      y1: 560,
      x2: 390,
      y2: 600,
    });
    expect(targetBounds(tree, { text: '33\\.33' })).toEqual({ x1: 20, y1: 300, x2: 380, y2: 340 });
    expect(targetBounds(tree, {})).toEqual({ x1: 20, y1: 100, x2: 380, y2: 140 });
    expect(targetBounds(tree, { id: 'missing' })).toBeNull();
  });

  it('passes a field above the keyboard and flags one behind it', () => {
    expect(coveredBy({ y1: 500, y2: 590 }, 592)).toBeNull();
    expect(coveredBy({ y1: 600, y2: 660 }, 592)).toBe(68);
  });
});
