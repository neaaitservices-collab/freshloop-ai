function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token.length > 2);
}

export function matchProduct<T extends { name: string }>(
  itemName: string,
  products: T[]
): T | null {
  const needle = compact(itemName);
  const needleTokens = new Set(tokens(itemName));
  let best: { product: T; score: number } | null = null;

  for (const product of products) {
    const hay = compact(product.name);
    let score = 0;
    if (hay === needle) score = 100;
    else if (needle.length > 4 && (hay.includes(needle) || needle.includes(hay))) score = 80;
    else score = tokens(product.name).filter((token) => needleTokens.has(token)).length * 10;

    if (!best || score > best.score) best = { product, score };
  }

  if (!best || best.score < 20) return null;
  return best.product;
}
