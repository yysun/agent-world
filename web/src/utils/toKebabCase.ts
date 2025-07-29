export default function (str: string): string {
  if (!str) return '';

  return str
    .replace(/\s+/g, '-')           // Replace spaces with hyphens
    .replace(/([a-z])([A-Z])/g, '$1-$2')  // Insert hyphen between camelCase
    .replace(/[^a-zA-Z0-9-]/g, '-') // Replace special characters with hyphens
    .replace(/-+/g, '-')            // Replace multiple hyphens with single
    .replace(/^-|-$/g, '')          // Remove leading/trailing hyphens
    .toLowerCase();                 // Convert to lowercase
}
