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
      summary: 'Kompaktes Wireless-Lab fuer autorisierte Tests',
      description: '2" LCD, 2x NRF24L01 500 mW, 1x CC1101, 3W IR und 2000 mAh Akku in einem portablen Geraet.',
      features: ['2" LCD Screen', '2x NRF24L01 500 mW', '1x CC1101 + 3W IR', '2000 mAh Akku']
    },
    'ducky-v1-case-rubber': {
      id: 'ducky-v1-case-rubber',
      name: 'Ducky V1 Case (Rubber)',
      price: 19,
      badge: 'Accessory',
      summary: 'Robuste Huelle fuer Alltag und Transport',
      description: 'Mehr Grip, Kanten-Schutz und ein sauberer Look fuer den taeglichen Einsatz.',
      features: ['Soft-Touch Finish', 'Erhoehter Kantenschutz', 'Praezise Aussparungen', 'Schneller Snap-on Fit']
    },
    'enclosure-clear': {
      id: 'enclosure-clear',
      name: 'Enclosure Clear',
      price: 14,
      badge: 'Case',
      summary: 'Transparentes Ersatzgehaeuse',
      description: 'Zeigt die Hardware und schuetzt sie mit einem leichten, klaren Polycarbonat-Gehaeuse.',
      features: ['Klares Polycarbonat', 'Leichte Bauweise', 'Sichtbare Hardware', 'Einfacher Wechsel']
    },
    'enclosure-black': {
      id: 'enclosure-black',
      name: 'Enclosure Black',
      price: 14,
      badge: 'Case',
      summary: 'Matt-schwarzes Ersatzgehaeuse',
      description: 'Schlichter Look mit derselben kompakten Form und alltagstauglicher Oberflaeche.',
      features: ['Mattes Finish', 'Schlankes Profil', 'Kratzresistent', 'Einfacher Wechsel']
    }
  };
});
