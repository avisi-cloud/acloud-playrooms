import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const css = readFileSync(
  new URL('../frontend/src/app/shared/styles/_tokens.css', import.meta.url),
  'utf8',
);
const [lightCss, darkCss] = css.split('html.app-dark {');
const parseTokens = (source) =>
  Object.fromEntries(
    [...source.matchAll(/--([\w-]+): (#[\da-f]{6})/gi)].map((match) => [match[1], match[2]]),
  );
const light = parseTokens(lightCss);
const dark = { ...light, ...parseTokens(darkCss) };
const luminance = (hex) => {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
};
const contrast = (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
};

console.log('| Text token | Light minimum | Dark minimum |');
console.log('| --- | --- | --- |');
for (const name of [
  'tx',
  'tx-2',
  'tx-3',
  'link',
  'accent-text',
  'ok',
  'busy',
  'warn',
  'bad',
  'idle',
]) {
  const minimums = [light, dark].map((tokens) => {
    const minimum = Math.min(
      ...['win', 'surf-2', 'surf-3'].map((surface) => contrast(tokens[name], tokens[surface])),
    );
    assert(minimum >= 4.5, `${name}: ${minimum.toFixed(2)}:1`);
    return `${minimum.toFixed(2)}:1`;
  });
  console.log(`| ${name} | ${minimums.join(' | ')} |`);
}
console.log('\n| Fixed dark header token | Minimum (both themes) |');
console.log('| --- | --- |');
for (const name of ['ok-on-dark', 'busy-on-dark', 'warn-on-dark', 'bad-on-dark', 'idle-on-dark']) {
  const minimum = contrast(light[name], '#005472');
  assert(minimum >= 4.5, `${name}: ${minimum.toFixed(2)}:1`);
  console.log(`| ${name} | ${minimum.toFixed(2)}:1 |`);
}

const presetSource = readFileSync(
  new URL('../frontend/src/app/app.config.ts', import.meta.url),
  'utf8',
);
console.log('\n| PrimeNG text token | Light minimum | Dark minimum |');
console.log('| --- | --- | --- |');
for (const [section, property] of [
  ['text', 'mutedColor'],
  ['text', 'hoverMutedColor'],
  ['formField', 'placeholderColor'],
  ['formField', 'floatLabelColor'],
  ['formField', 'floatLabelActiveColor'],
]) {
  const minimums = ['light', 'dark'].map((theme) => {
    const scheme = presetSource.match(new RegExp(`${theme}: \\{([\\s\\S]*?)\\n      \\},`))?.[1];
    assert(scheme, `Missing PrimeNG ${theme} scheme`);
    const settings = scheme.match(new RegExp(`${section}: \\{([\\s\\S]*?)\\}`))?.[1];
    const token = settings?.match(new RegExp(`${property}: 'var\\(--([\\w-]+)\\)'`))?.[1];
    assert(token, `PrimeNG ${theme} ${section}.${property} must use a checked text token`);
    const tokens = theme === 'light' ? light : dark;
    const backgrounds = ['win', 'surf-2', 'surf-3'].map((surface) => tokens[surface]);
    // PrimeNG also paints its own input and overlay surfaces.
    backgrounds.push(
      theme === 'light' ? '#ffffff' : '#001520',
      ...(theme === 'dark' ? ['#002233'] : []),
    );
    const minimum = Math.min(
      ...backgrounds.map((background) => contrast(tokens[token], background)),
    );
    assert(minimum >= 4.5, `${theme} ${section}.${property}: ${minimum.toFixed(2)}:1`);
    return `${minimum.toFixed(2)}:1`;
  });
  console.log(`| ${section}.${property} | ${minimums.join(' | ')} |`);
}
console.log(
  `\nPrimeNG muted/placeholder text on white: ${contrast(light['tx-3'], '#ffffff').toFixed(2)}:1; on light surf-3: ${contrast(light['tx-3'], light['surf-3']).toFixed(2)}:1.`,
);

const buttonPreset = presetSource.split('  components: {')[1];
assert(buttonPreset, 'Missing PrimeNG button overrides');
console.log('\n| Secondary text buttons | Light minimum | Dark minimum |');
console.log('| --- | --- | --- |');
const secondaryMinimums = ['light', 'dark'].map((theme) => {
  const scheme = buttonPreset.match(new RegExp(`${theme}: \\{([\\s\\S]*?)\\n        \\},`))?.[1];
  const colorToken = scheme?.match(/color: 'var\(--([\w-]+)\)'/)?.[1];
  assert.equal(colorToken, 'tx-2', `${theme} secondary text button color`);
  const tokens = theme === 'light' ? light : dark;
  const backgrounds = ['win', 'surf-2', 'surf-3'].map((surface) => tokens[surface]);
  backgrounds.push(theme === 'light' ? '#f5f7fa' : '#003345');
  if (theme === 'dark') {
    assert(
      scheme?.includes("activeBackground: 'var(--surf-3)'"),
      'Dark pressed text buttons need a checked background',
    );
    backgrounds.push('#001520', '#002233');
  }
  const minimum = Math.min(
    ...backgrounds.map((background) => contrast(tokens[colorToken], background)),
  );
  assert(minimum >= 4.5, `${theme} secondary text button: ${minimum.toFixed(2)}:1`);
  return `${minimum.toFixed(2)}:1`;
});
console.log(`| Normal, hover and pressed | ${secondaryMinimums.join(' | ')} |`);
console.log(
  `\nLight secondary text buttons on white: ${contrast(light['tx-2'], '#ffffff').toFixed(2)}:1.`,
);
