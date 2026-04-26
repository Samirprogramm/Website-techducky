(function attachCatalog(root, factory) {
  const catalog = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = catalog;
  }

  if (root) {
    root.TECH_DUCKY_PRODUCTS = catalog;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildCatalog() {
  return {
    'ducky-v1': {
      id: 'ducky-v1',
      name: 'Ducky V1',
      price: 69.95,
      badge: 'Research Device',
      summary: 'Compact wireless lab for authorized tests',
      description: '2" LCD, 2x NRF24L01 500 mW, 1x CC1101, 3W IR, and a 2000 mAh battery in one portable device.',
      features: ['2" LCD Screen', '2x NRF24L01 500 mW', '1x CC1101 + 3W IR', '2000 mAh battery']
    },
    'ducky-v1-case-rubber': {
      id: 'ducky-v1-case-rubber',
      name: 'Ducky V1 Case (Rubber)',
      price: 19,
      badge: 'Accessory',
      summary: 'Rugged case for daily use and transport',
      description: 'More grip, edge protection, and a clean look for daily use.',
      features: ['Soft-Touch Finish', 'Raised edge protection', 'Precise cutouts', 'Fast snap-on fit']
    },
    'enclosure-clear': {
      id: 'enclosure-clear',
      name: 'Enclosure Clear',
      price: 14,
      badge: 'Case',
      summary: 'Transparent replacement enclosure',
      description: 'Shows the hardware while protecting it with a light, clear polycarbonate enclosure.',
      features: ['Clear polycarbonate', 'Lightweight build', 'Visible hardware', 'Easy swap']
    },
    'enclosure-black': {
      id: 'enclosure-black',
      name: 'Enclosure Black',
      price: 14,
      badge: 'Case',
      summary: 'Matte black replacement enclosure',
      description: 'Minimal look with the same compact shape and durable everyday surface.',
      features: ['Matte finish', 'Slim profile', 'Scratch resistant', 'Easy swap']
    }
  };
});
