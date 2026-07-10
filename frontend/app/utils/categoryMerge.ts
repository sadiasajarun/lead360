// Category canonicalization for the Projects page: the scraped riseuplabs.com portfolio uses many
// spellings of the same idea ("Mobile App" / "Mobile Application" / "Mobile App Development",
// "Lifestyle App" / "Lifestyle Application", even the typo "Information Mangement System").
// The dropdown merges them into one canonical label; underlying data is left untouched.

const SYNONYMS: Record<string, string> = {
  'mobile app': 'Mobile App',
  'mobile application': 'Mobile App',
  'mobile app development': 'Mobile App',
  app: 'Mobile App',
  lifestyle: 'Lifestyle App',
  'lifestyle app': 'Lifestyle App',
  'lifestyle application': 'Lifestyle App',
  'information management system': 'Information Management System',
  'information mangement system': 'Information Management System', // typo in source data
  ims: 'Information Management System',
  software: 'Software',
  'software development': 'Software',
  web: 'Web Application',
  'web application': 'Web Application',
  website: 'Website',
  'website development': 'Website',
  'web development': 'Web Development',
  'web development & redesign': 'Web Development',
  'web system': 'Web System',
  'web system development': 'Web System',
  ecommerce: 'eCommerce',
  'e-commerce': 'eCommerce',
  elearning: 'eLearning',
  'e-learning': 'eLearning',
  game: 'Game',
  'game development': 'Game',
};

function norm(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Canonical display label for a category tag (unknown tags pass through as typed). */
export function canonicalCategory(tag: string): string {
  return SYNONYMS[norm(tag)] ?? tag.trim();
}

/** Merged, deduped, sorted dropdown options from any number of tag lists. */
export function mergedCategoryOptions(...lists: string[][]): string[] {
  const seen = new Map<string, string>(); // lower -> label
  for (const list of lists) {
    for (const raw of list) {
      const label = canonicalCategory(raw);
      if (label && !seen.has(label.toLowerCase())) seen.set(label.toLowerCase(), label);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
