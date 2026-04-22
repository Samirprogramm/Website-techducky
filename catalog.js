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
      price: 79,
      badge: 'Flagship',
      summary: 'All-in-One wireless research device',
      description: 'CC1101, NRF24, WiFi and IR inside one portable chassis.',
      features: ['CC1101 Sub-GHz', 'NRF24 2.4 GHz', 'WiFi + IR', 'USB-C rechargeable']
    },
    'ducky-v1-case-rubber': {
      id: 'ducky-v1-case-rubber',
      name: 'Ducky V1 Case (Rubber)',
      price: 19,
      badge: 'Accessory',
      summary: 'Shock-absorbing rubber shell',
      description: 'Adds grip, drop protection and a cleaner everyday carry.',
      features: ['Soft-touch finish', 'Raised edge protection', 'Precise cut-outs', 'Quick snap-on fit']
    },
    'enclosure-clear': {
      id: 'enclosure-clear',
      name: 'Enclosure Clear',
      price: 14,
      badge: 'Case',
      summary: 'Transparent replacement enclosure',
      description: 'Show off the hardware with a clean transparent shell.',
      features: ['Clear polycarbonate', 'Lightweight build', 'Board visibility', 'Easy replacement']
    },
    'enclosure-black': {
      id: 'enclosure-black',
      name: 'Enclosure Black',
      price: 14,
      badge: 'Case',
      summary: 'Matte black replacement enclosure',
      description: 'Stealthier look with the same compact footprint.',
      features: ['Matte black finish', 'Slim profile', 'Scratch resistant', 'Easy replacement']
    }
  };
});
