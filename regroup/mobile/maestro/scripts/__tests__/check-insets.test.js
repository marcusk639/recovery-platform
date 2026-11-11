const { parseBounds, parseBars, findOverlaps } = require('../check-insets');

const DUMPSYS = `
        InsetsSource id=3e50001 type=navigationBars frame=[0,2337][1080,2400] visible=true flags=SUPPRESS_SCRIM sideHint=BOTTOM boundingRects=null
        InsetsSource id=3e50005 type=mandatorySystemGestures frame=[0,2316][1080,2400] visible=true flags= sideHint=BOTTOM boundingRects=null
        InsetsSource id=21cf0000 type=statusBars frame=[0,0][1080,136] visible=true flags= sideHint=TOP boundingRects=null
        mSource=InsetsSource id=21cf0000 type=statusBars frame=[0,0][1080,136] visible=true flags= sideHint=TOP boundingRects=null
        InsetsSource id=1 type=ime frame=[0,1500][1080,2400] visible=false flags= sideHint=BOTTOM boundingRects=null
`;
const BARS = parseBars(DUMPSYS);

const node = (attributes, children = []) => ({ attributes, children });
const screen = (...children) =>
  node({ 'resource-id': '', bounds: '[0,0][1080,2400]' }, [
    node({ 'resource-id': 'com.android.systemui:id/status_bar', bounds: '[0,0][1080,136]' }, [
      node({ text: '', accessibilityText: 'Battery 100 percent.', bounds: '[985,51][1005,85]' }),
    ]),
    ...children,
  ]);

describe('check-insets', () => {
  it('parses bounds', () => {
    expect(parseBounds('[43,184][149,260]')).toEqual({ x1: 43, y1: 184, x2: 149, y2: 260 });
    expect(parseBounds('nonsense')).toBeNull();
  });

  it('reads each visible status and navigation bar once', () => {
    expect(BARS).toEqual([
      { type: 'navigationBars', x1: 0, y1: 2337, x2: 1080, y2: 2400 },
      { type: 'statusBars', x1: 0, y1: 0, x2: 1080, y2: 136 },
    ]);
  });

  it('reads the Android 11 (API 30) source names', () => {
    const api30 = `
      InsetsSource type=ITYPE_STATUS_BAR frame=[0,0][1080,63] visible=true
      InsetsSource type=ITYPE_NAVIGATION_BAR frame=[0,2274][1080,2400] visible=true
      InsetsSource type=ITYPE_TOP_GESTURES frame=[0,0][1080,63] visible=true`;
    expect(parseBars(api30)).toEqual([
      { type: 'statusBars', x1: 0, y1: 0, x2: 1080, y2: 63 },
      { type: 'navigationBars', x1: 0, y1: 2274, x2: 1080, y2: 2400 },
    ]);
  });

  it('passes a screen laid out inside the insets', () => {
    const tree = screen(
      node({ text: 'My Profile', bounds: '[148,181][416,262]' }),
      node({
        text: 'APPLY',
        'resource-id': 'save-profile-button',
        bounds: '[560,2151][1037,2294]',
      }),
    );
    expect(findOverlaps(tree, BARS)).toEqual([]);
  });

  it('flags a header drawn under the status bar', () => {
    const tree = screen(node({ text: 'Dispute Activity', bounds: '[148,40][560,120]' }));
    expect(findOverlaps(tree, BARS)).toEqual([
      { bar: 'statusBars', text: 'Dispute Activity', bounds: '[148,40][560,120]', px: 80 },
    ]);
  });

  it('flags a tappable view under the navigation bar, even without text', () => {
    const tree = screen(
      node({
        'resource-id': 'manual-payment-fab',
        clickable: 'true',
        bounds: '[880,2250][1040,2390]',
      }),
    );
    expect(findOverlaps(tree, BARS)).toEqual([
      expect.objectContaining({ bar: 'navigationBars', text: '(manual-payment-fab)' }),
    ]);
  });

  it('ignores System UI, full-bleed backgrounds and a few pixels of slack', () => {
    const tree = screen(
      node({ 'resource-id': 'android:id/content', bounds: '[0,0][1080,2400]' }),
      node({ text: 'Edge', bounds: '[0,133][300,200]' }),
    );
    expect(findOverlaps(tree, BARS)).toEqual([]);
  });
});
