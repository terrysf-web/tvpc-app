// lucide-react-native only ships type declarations for its barrel entry point,
// not for the individual icon files under dist/esm/icons/*.mjs that we import
// directly (to avoid Metro bundling the entire ~1750-icon library via the
// barrel export). This declares the shape of those deep imports.
declare module 'lucide-react-native/dist/esm/icons/*.mjs' {
  import type { LucideIcon } from 'lucide-react-native';
  const icon: LucideIcon;
  export default icon;
}
