import { describe, expect, it } from 'vitest';
import { getInput, grtEncode, parseGrtLoad, setInput } from '../src/index.ts';

const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<GordonsReloadingTool version='2021.2030-NIGHTLY'>
  <InnerBallistikInput>
    <title>Test</title>
    <caliber>
      <input name="ps" value="200" unit="bar" type="decimal" descr="initial gas pressure" />
    </caliber>
    <projectile>
      <input name="gpressure" value="200" unit="bar" type="decimal" descr="initial gas pressure" />
      <input name="mp" value="10.692" unit="g" type="decimal" descr="projectile weight" />
    </projectile>
    <propellant>
      <input name="mc" value="2.79" unit="g" type="decimal" descr="propellant mass" />
    </propellant>
  </InnerBallistikInput>
</GordonsReloadingTool>`;

describe('setInput', () => {
  it('changes only the addressed field of the addressed section', () => {
    const out = setInput(xml, 'projectile', 'gpressure', 350);
    expect(getInput(out, 'projectile', 'gpressure')).toBe('350');
    expect(getInput(out, 'caliber', 'ps')).toBe('200');
    expect(out.replace('value="350"', 'value="200"')).toBe(xml);
  });

  it('round-trips through the parser', () => {
    const out = setInput(xml, 'propellant', 'mc', 2.5);
    expect(parseGrtLoad(out).propellant.mc?.value).toBe('2.5');
  });

  it('fails on unknown fields', () => {
    expect(() => setInput(xml, 'gun', 'xe', 1)).toThrow();
    expect(() => setInput(xml, 'projectile', 'nope', 1)).toThrow();
  });

  it('encodes like GRT', () => {
    expect(grtEncode('.308 Win. (7,62 x 51)')).toBe('.308%20Win.%20%287%2C62%20x%2051%29');
  });
});
