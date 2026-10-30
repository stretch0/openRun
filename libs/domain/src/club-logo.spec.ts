import { LOGO_COLOURS, clubInitials, clubLogoColour } from './club-logo.js';

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance. */
function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hue(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return null;
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('clubInitials', () => {
  it('takes the first letters of the first two words', () => {
    expect(clubInitials('Hackney Harriers')).toBe('HH');
    expect(clubInitials('crouch end runners')).toBe('CE');
    expect(clubInitials('Run-Dem Crew')).toBe('RD');
  });

  it('skips small words when there are others', () => {
    expect(clubInitials('The Running Club of Leeds')).toBe('RC');
    expect(clubInitials('The A Team')).toBe('TE');
    expect(clubInitials('The')).toBe('TH');
  });

  it('uses the first two letters of a one-word name', () => {
    expect(clubInitials('Parkrunners')).toBe('PA');
    expect(clubInitials('Q')).toBe('Q');
    expect(clubInitials('  Ölstadt  ')).toBe('ÖL');
  });

  it('ignores punctuation and copes with names it cannot use', () => {
    expect(clubInitials('"Saturday" Social!')).toBe('SS');
    expect(clubInitials('10K Club')).toBe('1C');
    expect(clubInitials('🏃‍♀️')).toBe('?');
    expect(clubInitials('')).toBe('?');
  });
});

describe('clubLogoColour', () => {
  it('is the same for the same club and spreads clubs across the palette', () => {
    expect(clubLogoColour('club-1')).toBe(clubLogoColour('club-1'));
    const used = new Set(
      Array.from({ length: 200 }, (_, i) => clubLogoColour(`club-${i}`)),
    );
    expect(used.size).toBe(LOGO_COLOURS.length);
  });

  it('keeps white initials readable and stays away from the brand teal', () => {
    for (const colour of LOGO_COLOURS) {
      expect(contrast(colour, '#ffffff'), colour).toBeGreaterThanOrEqual(4.5);
      const h = hue(colour);
      // Brand teal sits at about 173°.
      if (h !== null) expect(Math.abs(h - 173), colour).toBeGreaterThan(40);
    }
  });
});
