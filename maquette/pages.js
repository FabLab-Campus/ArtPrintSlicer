// ArtPrint Slicer - licence AGPL v3
// Maquette : pages Imprimante (caméra, progression, contrôle et déplacements
// 5 axes) et Gestionnaire de bobines. Rien n'est envoyé à une vraie machine :
// la page Imprimante ne fait que changer les valeurs affichées.
import { icone } from './icones.js';

const $ = (id) => document.getElementById(id);
const el = (balise, classe, texte) => {
  const e = document.createElement(balise);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
};
const fr = (valeur, decimales = 1) => Number(valeur).toLocaleString('fr-FR',
  { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
const entier = (valeur) => Number(valeur).toLocaleString('fr-FR');
const sansAccent = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// « app » : ce que la page principale prête (état, messages, bobines).
export function brancherPages(app) {
  const imprimante = brancherImprimante(app);
  const gestionnaire = brancherGestionnaire(app);
  const projet = brancherProjet(app);
  return { rafraichir() { imprimante.afficher(); gestionnaire.afficher(); projet.afficher(); }, projet };
}

// --- Imprimante -----------------------------------------------------------------

// Sur l'écran de la machine, B = -90° quand la buse est verticale. Les limites
// de B des réglages du slicer sont comptées depuis la verticale : on les décale.
const B_VERTICAL = -90;
const AXES = [['x', 'mm'], ['y', 'mm'], ['z', 'mm'], ['b', '°'], ['c', '°']];

function brancherImprimante(app) {
  const machine = { x: 0, y: 0, z: 0, b: B_VERTICAL, c: 0, aZero: false, pasLineaire: 10, pasAngle: 10 };

  const reglage = (cle, defaut) => {
    const valeur = app.lireNombre(app.moteur(cle));
    return Number.isFinite(valeur) ? valeur : defaut;
  };
  // Butées de chaque axe, lues dans les réglages de la machine quand ils existent.
  function butees(axe) {
    const rayon = reglage('rayon_plateau', 150);
    if (axe === 'x') return [reglage('course_x_min', -rayon), reglage('course_x_max', rayon)];
    if (axe === 'y') return [reglage('course_y_min', -rayon), reglage('course_y_max', rayon)];
    if (axe === 'z') return [reglage('course_z_min', 0), reglage('course_z_max', reglage('hauteur_impression', 260))];
    if (axe === 'b') return [B_VERTICAL + reglage('b_min', -90), B_VERTICAL + reglage('b_max', 90)];
    return [-Infinity, Infinity];
  }

  function afficher() {
    $('positions').replaceChildren(...AXES.map(([axe, unite]) => {
      const puce = el('span', 'position');
      puce.id = 'position-' + axe;
      puce.append(el('b', '', axe.toUpperCase()), el('span', '', `${fr(machine[axe])}${unite === '°' ? '°' : ' mm'}`));
      if (!machine.aZero) {
        const alerte = icone('attention');
        puce.title = 'Axe pas encore mis à zéro';
        puce.append(alerte);
      }
      return puce;
    }));
    $('dep-alerte').hidden = machine.aZero;
    for (const [id, pas, unite, cle] of [['pas-lineaire', [1, 10, 50], ' mm', 'pasLineaire'], ['pas-angle', [1, 10, 45], '°', 'pasAngle']]) {
      $(id).replaceChildren(...pas.map((valeur) => {
        const bouton = el('button', machine[cle] === valeur ? 'actif' : '', `${valeur}${unite}`);
        bouton.setAttribute('aria-pressed', String(machine[cle] === valeur));
        bouton.addEventListener('click', () => { machine[cle] = valeur; afficher(); });
        return bouton;
      }));
    }
    $('pas-z').textContent = `Pas de ${machine.pasLineaire} mm`;

    const b = app.bobineMontee();
    const mesure = (nom, dessin, valeur, detail) => {
      const bloc = el('div', 'temperature');
      bloc.append(icone(dessin, 20), el('small', '', nom), el('b', '', valeur));
      bloc.title = detail;
      return bloc;
    };
    $('temperatures').replaceChildren(
      mesure('Buse', 'buse', b ? `– / ${b.temp_buse} °C` : '– °C', 'Température mesurée / consigne de la bobine montée'),
      mesure('Plateau', 'plateau', b ? `– / ${b.temp_plateau} °C` : '– °C', 'Température mesurée / consigne de la bobine montée'),
      mesure('Ventilateur', 'ventilateur', '– %', 'Ventilateur de pièce'));
  }

  // Déplace un axe d'un pas, sans dépasser ses butées.
  function bouger(axe, sens) {
    if (!machine.aZero) {
      app.dire('Mets d\'abord les axes à zéro avec « Tout mettre à zéro ».');
      return;
    }
    const pas = axe === 'b' || axe === 'c' ? machine.pasAngle : machine.pasLineaire;
    const [mini, maxi] = butees(axe);
    let cible = machine[axe] + sens * pas;
    if (axe === 'c') cible = ((cible + 180) % 360 + 360) % 360 - 180;   // le plateau tourne sans fin
    const bornee = Math.min(maxi, Math.max(mini, cible));
    if (bornee !== cible) {
      app.dire(`Butée de l'axe ${axe.toUpperCase()} : ${fr(bornee)} ${axe === 'b' ? '°' : 'mm'}.`, { info: true });
    }
    machine[axe] = bornee;
    afficher();
  }
  function aller(valeurs, message) {
    if (!machine.aZero) {
      app.dire('Mets d\'abord les axes à zéro avec « Tout mettre à zéro ».');
      return;
    }
    for (const [axe, valeur] of Object.entries(valeurs)) {
      const [mini, maxi] = butees(axe);
      machine[axe] = Math.min(maxi, Math.max(mini, valeur));
    }
    afficher();
    app.dire(message, { info: true });
  }

  for (const touche of document.querySelectorAll('.touche[data-axe]')) {
    touche.addEventListener('click', () => bouger(touche.dataset.axe, Number(touche.dataset.sens)));
  }
  $('dep-zero').addEventListener('click', () => {
    Object.assign(machine, { x: 0, y: 0, z: 0, b: B_VERTICAL, c: 0, aZero: true });
    afficher();
    app.dire('Simulation : tous les axes sont à zéro.', { info: true });
  });
  $('dep-origine-xy').addEventListener('click', () => aller({ x: 0, y: 0 }, 'Simulation : X et Y à zéro.'));
  $('dep-z150').addEventListener('click', () => aller({ z: 150 }, 'Simulation : Z monté.'));
  $('dep-redresser').addEventListener('click', () => aller({ b: B_VERTICAL }, 'Simulation : tête redressée, buse verticale.'));
  $('dep-plateau0').addEventListener('click', () => aller({ c: 0 }, 'Simulation : plateau à 0°.'));
  $('dep-liberer').addEventListener('click', () => {
    machine.aZero = false;
    afficher();
    app.dire('Simulation : moteurs libérés. Les axes devront être remis à zéro.', { info: true });
  });

  // Caméra, menu de gauche et options : à venir, dit clairement.
  $('btn-camera').append(icone('lecture', 24));
  for (const id of ['btn-camera', 'btn-camera-2', 'btn-camera-plein', 'btn-camera-reglages']) {
    $(id).addEventListener('click', () => app.dire('Caméra : à venir. Aucune caméra n\'est encore reliée au slicer.', { info: true }));
  }
  // Menu de gauche : État, Fichiers, Mise à jour.
  const SOUS_PAGES = { 'menu-etat': null, 'menu-fichiers': 'imprimante-fichiers', 'menu-maj': 'imprimante-maj' };
  function choisirSousPage(menu) {
    for (const [id, section] of Object.entries(SOUS_PAGES)) {
      $(id).classList.toggle('actif', id === menu);
      if (section) $(section).hidden = id !== menu;
    }
    const etat = menu === 'menu-etat';
    document.querySelector('#page-imprimante .camera-zone').hidden = !etat;
    document.querySelector('#page-imprimante .controle').hidden = !etat;
    if (menu === 'menu-fichiers') afficherFichiers();
    if (menu === 'menu-maj') afficherMiseAJour();
  }
  for (const id of Object.keys(SOUS_PAGES)) $(id).addEventListener('click', () => choisirSousPage(id));

  // Fichiers : les G-code exportés depuis ce slicer. (Ceux de la mémoire de
  // l'imprimante s'ajouteront quand elle sera reliée.)
  function afficherFichiers() {
    const exports = app.exports();
    $('fichiers-etat').textContent = 'Imprimante non connectée';
    $('fichiers-aide').textContent = exports.length
      ? 'Les G-code exportés depuis ce slicer, du plus récent au plus ancien. L\'envoi à l\'imprimante et la liste de sa mémoire demandent la liaison avec la machine, pas encore branchée.'
      : 'Aucun G-code exporté pour l\'instant. Tranche une pièce puis clique sur « Exporter le G-code » : le fichier apparaîtra ici. La liste de la mémoire de l\'imprimante demande la liaison avec la machine, pas encore branchée.';
    const table = $('fichiers-table');
    table.replaceChildren();
    if (!exports.length) return;
    const tete = el('div', 'fichier tete');
    tete.append(el('span', '', 'Fichier'), el('span', 'secondaire', 'Impression'), el('span', 'secondaire', 'Exporté le'), el('span', '', ''));
    table.append(tete);
    exports.forEach((f, rang) => {
      const ligne = el('div', 'fichier');
      ligne.id = `fichier-${rang + 1}`;
      const nom = el('span');
      nom.append(el('b', '', f.nom), el('small', '', f.chemin));
      nom.title = f.chemin;
      const actions = el('span', 'actions');
      const envoyer = el('button', 'bouton fin', 'Envoyer');
      envoyer.title = 'Envoyer à l\'imprimante (liaison pas encore branchée)';
      envoyer.addEventListener('click', () => app.dire('Envoi à l\'imprimante : la liaison avec la machine n\'est pas encore branchée. Le fichier est sur ton ordinateur, au chemin indiqué.', { info: true }));
      const retirer = el('button', 'bouton-icone');
      retirer.title = 'Retirer de la liste (le fichier n\'est pas supprimé)';
      retirer.setAttribute('aria-label', `Retirer ${f.nom} de la liste`);
      retirer.append(icone('supprimer'));
      retirer.addEventListener('click', () => { app.retirerExport(rang); afficherFichiers(); });
      actions.append(envoyer, retirer);
      ligne.append(nom, el('span', 'secondaire', `${f.duree} · ${f.grammes} g · ${f.strategie}`), el('span', 'secondaire', f.date), actions);
      table.append(ligne);
    });
  }

  // Mise à jour : la version du slicer, et celle de l'imprimante quand elle sera reliée.
  function afficherMiseAJour() {
    const carte = (titre, valeur, detail, libelle, action) => {
      const c = el('div', 'carte-maj');
      c.append(el('b', '', titre), el('span', 'valeur', valeur), el('span', 'aide', detail));
      if (libelle) {
        const bouton = el('button', 'bouton', libelle);
        bouton.addEventListener('click', action);
        c.append(bouton);
      }
      return c;
    };
    $('cartes-maj').replaceChildren(
      carte('ArtPrint Slicer', `Version ${app.version()}`, 'La version installée sur cet ordinateur.', 'Chercher une mise à jour',
        () => app.dire('La recherche de mise à jour en ligne n\'est pas encore branchée. La dernière version est celle que tu as installée à la main.', { info: true })),
      carte('Firmware de l\'imprimante', 'Inconnu', 'Imprimante non connectée : sa version (Klipper) s\'affichera ici.', 'Mettre à jour',
        () => app.dire('Mise à jour du firmware : il faut d\'abord la liaison avec l\'imprimante, pas encore branchée.', { info: true })),
      carte('Profil de la machine', app.profilMachine(), 'Les valeurs d\'usine posées par le slicer (pivot, hauteur, butées de B).', 'Voir les réglages', () => app.ouvrirMachine()));
    $('maj-aide').textContent = 'Rien n\'est téléchargé ni envoyé depuis cette page pour l\'instant.';
  }
  brancherCalibration(app, { butees, machine });
  for (const bouton of document.querySelectorAll('[data-a-venir]')) {
    bouton.addEventListener('click', () => app.dire(`${bouton.dataset.aVenir} : à venir.`, { info: true }));
  }
  const vignette = new Image();
  vignette.alt = '';
  vignette.addEventListener('error', () => $('progression-vignette').replaceChildren(icone('imprimante', 24)));
  vignette.src = 'prive/imprimante.png';
  $('progression-vignette').replaceChildren(vignette);

  return { afficher };
}

// --- Calibration --------------------------------------------------------------------

// Les mesures à faire sur la machine. « cles » : les réglages du slicer où les reporter.
const CALIBRATIONS = [
  { titre: 'Distance pivot – buse', cles: ['distance_pivot_buse'], etapes: [
    'Mets la tête à la verticale.',
    'Mesure la distance entre l\'axe du pivot de la tête et la pointe de la buse.',
    'Reporte-la dans « Distance pivot – buse ».'] },
  { titre: 'Encombrement de la tête', cles: ['tete_demi_largeur', 'tete_hauteur'], etapes: [
    'Mesure la demi-largeur du bloc de la tête, de chaque côté de l\'axe de la buse.',
    'Mesure sa longueur au-delà du pivot, du côté opposé à la buse.',
    'Reporte les deux valeurs : le slicer calcule alors jusqu\'où la tête peut pencher à chaque hauteur.'] },
  { titre: 'Butées de la tête (B)', cles: ['b_min', 'b_max', 'b_inclinaison_max'], etapes: [
    'Incline doucement la tête d\'un côté jusqu\'à sa limite, puis de l\'autre.',
    'Note les deux angles, comptés depuis la verticale.',
    'Reporte-les dans les butées de B, et la limite du firmware dans « Inclinaison maximale ».'] },
  { titre: 'Sens des axes B et C', cles: ['sens_b', 'sens_c', 'axe_pivot_b'], etapes: [
    'Demande un petit mouvement B+ puis C+ (mode développeur).',
    'Regarde de quel côté la tête penche et dans quel sens le plateau tourne.',
    'Si c\'est l\'inverse de ce que montre le slicer, change le sens (1 ou -1).'] },
  { titre: 'Courses des axes X, Y, Z', cles: ['course_x_min', 'course_x_max', 'course_y_min', 'course_y_max', 'course_z_min', 'course_z_max'], etapes: [
    'Après la mise à zéro, déplace chaque axe jusqu\'à ses deux limites.',
    'Note les positions affichées.',
    'Reporte-les : sans elles, le slicer ne vérifie pas les courses.'] },
  { titre: 'Rétraction', cles: ['retraction_longueur'], etapes: [
    'Imprime deux petites tours espacées.',
    'S\'il y a des fils entre elles, augmente la rétraction par pas de 0,2 mm.',
    'Reporte la valeur dans les paramètres (onglet Autres).'] },
];

function brancherCalibration(app, { butees, machine }) {
  function afficherCartes() {
    $('calibration-cartes').replaceChildren(...CALIBRATIONS.map((c) => {
      const carte = el('div', 'carte-calibration');
      const liste = el('ol');
      for (const etape of c.etapes) liste.append(el('li', '', etape));
      const valeurs = c.cles.map((cle) => [app.libelle(cle), String(app.moteur(cle) ?? '').trim()]);
      const manque = valeurs.filter(([, v]) => v === '').length;
      const etat = el('span', 'etat-reglage' + (manque ? ' manque' : ''),
        manque === valeurs.length ? 'Pas encore renseigné.'
          : valeurs.map(([nom, v]) => `${nom} : ${v === '' ? 'à mesurer' : v}`).join(' · '));
      const bouton = el('button', 'bouton fin', 'Ouvrir les réglages');
      bouton.addEventListener('click', () => (c.cles[0] === 'retraction_longueur' ? app.allerAuxParametres() : app.ouvrirMachine()));
      carte.append(el('b', '', c.titre), liste, etat, bouton);
      return carte;
    }));
  }

  // Mode développeur : déplacements et commandes G-code. Tant que l'imprimante
  // n'est pas reliée, rien n'est envoyé : le journal montre ce qui partirait.
  const pas = { lineaire: 10, angle: 10 };
  const journal = (classe, texte) => {
    const ligne = el('div', classe, texte);
    $('dev-journal').append(ligne);
    $('dev-journal').scrollTop = $('dev-journal').scrollHeight;
  };
  function envoyer(commande) {
    journal('envoi', `> ${commande}`);
    journal('retour', '  (simulation : imprimante non connectée, rien n\'est envoyé)');
  }
  function afficherAxes() {
    $('dev-etat').textContent = 'Simulation · imprimante non connectée';
    $('dev-axes').replaceChildren(...AXES.map(([axe, unite]) => {
      const bloc = el('div', 'dev-axe');
      const lineaire = unite === 'mm';
      const bouger = (sens) => () => {
        const distance = sens * (lineaire ? pas.lineaire : pas.angle);
        const [mini, maxi] = butees(axe);
        const cible = Math.min(maxi, Math.max(mini, machine[axe] + distance));
        if (cible === machine[axe]) { app.dire(`Butée de l'axe ${axe.toUpperCase()} atteinte.`, { info: true }); return; }
        const reel = Math.round((cible - machine[axe]) * 100) / 100;
        machine[axe] = cible;
        envoyer(`G91\n> G1 ${axe.toUpperCase()}${reel} F${lineaire ? 3000 : 600}\n> G90`);
        afficherAxes();
      };
      const plus = el('button', 'touche', `${axe.toUpperCase()}+`), moins = el('button', 'touche', `${axe.toUpperCase()}−`);
      plus.id = `dev-${axe}-plus`; moins.id = `dev-${axe}-moins`;
      plus.addEventListener('click', bouger(1)); moins.addEventListener('click', bouger(-1));
      const valeur = el('output', '', `${fr(machine[axe], 1)} ${unite}`);
      valeur.id = `dev-${axe}-valeur`;
      bloc.append(plus, valeur, moins);
      return bloc;
    }));
    for (const [id, valeurs, unite, cle] of [['dev-pas-lineaire', [0.1, 1, 10, 50], ' mm', 'lineaire'], ['dev-pas-angle', [1, 5, 10, 45], '°', 'angle']]) {
      $(id).replaceChildren(...valeurs.map((v) => {
        const bouton = el('button', pas[cle] === v ? 'actif' : '', `${String(v).replace('.', ',')}${unite}`);
        bouton.addEventListener('click', () => { pas[cle] = v; afficherAxes(); });
        return bouton;
      }));
    }
  }
  const ACTIONS = [
    ['Mise à zéro (G28)', 'dev-g28', () => { Object.assign(machine, { x: 0, y: 0, z: 0, b: B_VERTICAL, c: 0, aZero: true }); envoyer('G28'); afficherAxes(); }],
    ['Libérer les moteurs (M84)', 'dev-m84', () => { machine.aZero = false; envoyer('M84'); }],
    ['Éteindre la chauffe', 'dev-froid', () => envoyer('M104 S0\n> M140 S0')],
    ['Position actuelle (M114)', 'dev-m114', () => { envoyer('M114'); journal('retour', `  X:${machine.x} Y:${machine.y} Z:${machine.z} B:${machine.b} C:${machine.c}`); }],
    ['Vider le journal', 'dev-vider', () => $('dev-journal').replaceChildren()],
  ];
  $('dev-actions').replaceChildren(...ACTIONS.map(([libelle, id, action]) => {
    const bouton = el('button', 'bouton fin', libelle);
    bouton.id = id;
    bouton.addEventListener('click', action);
    return bouton;
  }));
  $('dev-saisie').addEventListener('submit', (e) => {
    e.preventDefault();
    const commande = $('dev-commande').value.trim();
    if (!commande) return;
    envoyer(commande);
    $('dev-commande').value = '';
  });
  $('mode-developpeur').addEventListener('change', (e) => {
    $('developpeur').hidden = !e.target.checked;
    if (e.target.checked) {
      afficherCartes();
      afficherAxes();
      if (!$('dev-journal').childElementCount) journal('retour', 'Mode développeur : les commandes s\'affichent ici. L\'imprimante n\'est pas encore reliée au slicer.');
      $('developpeur').scrollIntoView({ block: 'nearest' });
    }
  });
  $('vue-calibration').addEventListener('click', afficherCartes);
  afficherCartes();
  afficherGuides();
}

// --- Calibration : les guides -------------------------------------------------------
// Des explications pas à pas, écrites pour quelqu'un qui débute. « image » : ce
// que montrera l'illustration, quand elle sera fournie.

const GUIDES_REGLAGE = [
  { titre: '1. Mettre les axes à zéro', image: 'La machine, ses cinq axes et leur position de départ',
    pourquoi: 'L\'imprimante doit savoir où sont ses cinq axes avant de bouger : X (gauche-droite), Y (avant-arrière), Z (haut-bas), B (pivot de la tête) et C (plateau).',
    etapes: ['Retire tout ce qui se trouve sur le plateau.', 'Lance la mise à zéro depuis l\'écran de l\'imprimante.',
      'Vérifie que la tête est bien verticale et le plateau à son repère une fois la mise à zéro finie.'],
    probleme: 'Un axe ne trouve pas son zéro : vérifie que rien ne le bloque et que son capteur est branché.' },
  { titre: '2. Régler la hauteur de la première couche', image: 'Trois lignes de première couche : trop haute, bonne, trop écrasée',
    pourquoi: 'C\'est le réglage qui compte le plus : si la buse est trop haute, la pièce ne colle pas ; trop basse, le filament ne sort pas.',
    etapes: ['Nettoie le plateau (alcool isopropylique sur un chiffon propre).', 'Imprime un grand carré d\'une seule couche.',
      'Regarde les lignes : elles doivent se toucher, un peu aplaties, sans creux entre elles ni bourrelets.',
      'Corrige le décalage en Z sur l\'imprimante par pas de 0,02 mm, et recommence jusqu\'à ce que ce soit bon.'],
    probleme: 'Lignes rondes qui se décollent : la buse est trop haute. Lignes presque invisibles, extrudeur qui claque : trop basse.' },
  { titre: '3. Vérifier que la tête est verticale', image: 'La buse et une équerre posée sur le plateau',
    pourquoi: 'Quand B vaut zéro, la buse doit être parfaitement droite. Sinon toutes les inclinaisons sont décalées d\'autant.',
    etapes: ['Mets B à zéro.', 'Pose une petite équerre sur le plateau, contre la tête, puis regarde de face et de côté.',
      'Si la tête penche, corrige le zéro de B sur l\'imprimante (ou le réglage « B quand la buse est verticale », en mode développeur).'],
    probleme: 'Les pièces penchent toutes du même côté : c\'est presque toujours ce réglage.' },
  { titre: '4. Centrer le plateau tournant', image: 'La pointe de la buse au-dessus du centre du plateau',
    pourquoi: 'Le plateau tourne autour de son centre. Le slicer doit savoir exactement où il se trouve, sinon une pièce tournée de 180° n\'est plus au même endroit.',
    etapes: ['Amène la buse juste au-dessus du centre du plateau, à 1 mm.', 'Fais tourner le plateau d\'un tour complet, lentement.',
      'La pointe doit rester au-dessus du même point. Si elle décrit un petit cercle, le centre est décalé de la moitié de ce cercle.',
      'Corrige « centre du plateau » (X et Y) dans les réglages de la machine, en mode développeur.'],
    probleme: 'Un décalage entre le bas d\'une pièce et une partie imprimée après une rotation du plateau vient souvent de là.' },
  { titre: '5. Mesurer la distance du pivot à la buse', image: 'Le pivot de la tête et la pointe de la buse, avec la cote entre les deux',
    pourquoi: 'Quand la tête s\'incline, la pointe de la buse se déplace. Le slicer compense ce déplacement, à condition de connaître la distance exacte entre le pivot et la pointe.',
    etapes: ['Tête verticale, mesure la distance entre l\'axe du pivot et la pointe de la buse.', 'Reporte-la dans les réglages de la machine (mode développeur).',
      'Imprime un petit cube en « Tout incliné » à 30° : ses faces doivent être planes et le cube à la bonne taille.'],
    probleme: 'Une marche à chaque changement d\'inclinaison : cette distance est fausse de quelques dixièmes. Après un changement de buse, elle est à remesurer.' },
  { titre: '6. Régler le débit', image: 'Un cube à une seule paroi et un pied à coulisse',
    pourquoi: 'Chaque filament sort un peu plus ou un peu moins que prévu. Le débit corrige cet écart.',
    etapes: ['Imprime un cube creux à une seule paroi, sans dessus.', 'Mesure l\'épaisseur de la paroi au pied à coulisse, à plusieurs endroits.',
      'Nouveau débit = débit actuel × largeur voulue ÷ largeur mesurée.', 'Note-le dans la fiche de la bobine (Gestionnaire).'],
    probleme: 'Surface du dessus bosselée : trop de débit. Trous entre les lignes : pas assez.' },
  { titre: '7. Régler la température et la rétraction', image: 'Une tour de température et deux petites tours avec des fils entre elles',
    pourquoi: 'Chaque bobine a sa température idéale. La rétraction empêche le filament de couler pendant les déplacements à vide.',
    etapes: ['Pars des valeurs de la matière (fiche de la bobine).', 'Imprime une tour de température : garde l\'étage le plus propre.',
      'Imprime deux petites tours espacées : s\'il y a des fils, augmente la rétraction par pas de 0,2 mm.'],
    probleme: 'Si la rétraction ne suffit pas, le filament est sans doute humide : il faut le sécher.' },
];

const GUIDES_PROBLEME = [
  { titre: 'La première couche ne colle pas', image: 'Une première couche décollée dans un coin',
    causes: ['Plateau gras ou poussiéreux : nettoie-le à l\'alcool isopropylique.', 'Buse trop haute : reprends le guide 2.',
      'Plateau pas assez chaud pour la matière : vérifie la fiche de la bobine.', 'Première couche trop rapide : garde 20 mm/s.'] },
  { titre: 'Des fils entre les parties de la pièce', image: 'Des fils fins tendus entre deux colonnes',
    causes: ['Filament humide : c\'est la cause la plus fréquente, sèche la bobine.', 'Température trop haute : baisse de 5 °C.',
      'Rétraction trop courte : augmente par pas de 0,2 mm.'] },
  { titre: 'Les couches sont décalées', image: 'Une pièce dont le haut est décalé par rapport au bas',
    causes: ['Une courroie détendue ou une poulie desserrée.', 'La buse a heurté la pièce : un coin relevé, ou une tête trop inclinée près de la pièce.',
      'Vitesse ou accélération trop fortes pour la machine.'] },
  { titre: 'Des trous, des lignes manquantes', image: 'Une paroi avec des manques de matière',
    causes: ['Buse partiellement bouchée : fais une purge à chaud.', 'Température trop basse pour la vitesse demandée.',
      'Filament qui coince sur la bobine, ou extrudeur qui patine.', 'Débit trop faible : reprends le guide 6.'] },
  { titre: 'La pièce se décolle ou se déforme', image: 'Un coin de pièce relevé du plateau',
    causes: ['Matière qui se rétracte en refroidissant (ABS, ASA, nylon) : imprimante fermée, pas de courant d\'air.',
      'Plateau pas assez chaud.', 'Trop de ventilation sur les premières couches.', 'Grande surface à plat : ajoute une bordure autour de la pièce.'] },
  { titre: 'En ondulation : une marche entre deux parties', image: 'Un ressaut à la jonction entre le bas et une partie inclinée',
    causes: ['Distance pivot-buse inexacte : reprends le guide 5.', 'Centre du plateau décalé : reprends le guide 4.',
      'Tête pas tout à fait verticale à zéro : reprends le guide 3.'] },
  { titre: 'En ondulation : le slicer refuse de trancher', image: 'Le message du slicer et la position de la machine',
    causes: ['Le message dit toujours la ligne, la position et une solution : lis-le en entier.',
      'La tête toucherait la pièce ou le plateau : réduis l\'inclinaison de la zone, ou place-la plus haut.',
      'Une zone trop inclinée près du plateau : au ras du plateau, la tête ne dépasse pas la limite réglée.'] },
];

function afficherGuides() {
  const fabriquer = (guide, corps) => {
    const bloc = el('details', 'guide');
    bloc.append(el('summary', '', guide.titre));
    const contenu = el('div', 'guide-corps');
    contenu.append(...corps, el('div', 'guide-image', `Illustration à venir : ${guide.image}`));
    bloc.append(contenu);
    return bloc;
  };
  const liste = (balise, lignes) => { const l = el(balise); for (const ligne of lignes) l.append(el('li', '', ligne)); return l; };
  const paragraphe = (titre, texte) => { const p = el('p'); p.append(el('b', '', titre + ' '), document.createTextNode(texte)); return p; };
  $('guides-reglage').replaceChildren(...GUIDES_REGLAGE.map((g) => fabriquer(g, [
    paragraphe('Pourquoi.', g.pourquoi), liste('ol', g.etapes), paragraphe('Si ça ne va pas.', g.probleme)])));
  $('guides-probleme').replaceChildren(...GUIDES_PROBLEME.map((g) => fabriquer(g, [
    paragraphe('Ce qu\'il faut vérifier, dans l\'ordre :', ''), liste('ol', g.causes)])));
}

// --- Projet -------------------------------------------------------------------------
// Le projet en cours (son nom, ses notes, où il en est) et la bibliothèque des
// projets déjà enregistrés, rangés par dossiers.

const STATUTS = [['idee', 'Idée'], ['preparation', 'En préparation'], ['pret', 'Prêt à imprimer'], ['imprime', 'Imprimé']];
const nomDeFichier = (chemin) => String(chemin || '').split(/[\\/]/).pop();

function brancherProjet(app) {
  const filtre = { dossier: '', statut: '', recherche: '' };

  function afficherCourant() {
    const zone = $('projet-courant');
    const infos = app.projet.infos();
    const etat = app.projet.etat();
    const contenu = [];
    contenu.push(el('h3', '', etat.cheminProjet ? nomDeFichier(etat.cheminProjet).replace(/\.artprint$/i, '') : (etat.modele ? 'Projet sans titre' : 'Aucun projet ouvert')));
    if (!etat.modele) {
      contenu.push(el('p', 'aide', 'Ouvre un modèle (menu Fichier), ou reprends un projet de la liste. Un projet garde la pièce, sa pose, ses coupes, ses zones, tous les réglages, tes notes et où tu en es.'));
      zone.replaceChildren(...contenu);
      return;
    }
    const faits = el('dl', 'projet-faits');
    const fait = (nom, valeur) => faits.append(el('dt', '', nom), el('dd', '', valeur));
    fait('Modèle', etat.modele);
    fait('Taille', etat.taille);
    fait('Stratégie', etat.strategie);
    fait('Fichier', etat.cheminProjet || 'pas encore enregistré');
    contenu.push(faits);
    // Où en est le projet : quatre étapes, cochées toutes seules.
    const etapes = el('ul', 'projet-etapes');
    for (const [texte, ok] of [['Modèle ouvert', true], ['Tranché, G-code vérifié', etat.tranche], ['G-code exporté', etat.exporte], ['Projet enregistré', Boolean(etat.cheminProjet)]]) {
      etapes.append(el('li', ok ? 'fait' : '', texte));
    }
    contenu.push(etapes);
    const champ = (libelle, element) => { const l = el('label', '', libelle); l.append(element); return l; };
    const dossier = el('input', 'champ texte');
    dossier.id = 'projet-info-dossier';
    dossier.type = 'text';
    dossier.value = infos.dossier;
    dossier.placeholder = 'Par exemple : Figurines, Pièces de la machine';
    dossier.setAttribute('list', 'liste-dossiers');
    dossier.addEventListener('change', () => { app.projet.definirInfos({ dossier: dossier.value.trim() }); afficherBibliotheque(); });
    const statut = el('select', 'champ');
    statut.id = 'projet-info-statut';
    for (const [valeur, texte] of STATUTS) statut.add(new Option(texte, valeur, false, valeur === infos.statut));
    statut.addEventListener('change', () => { app.projet.definirInfos({ statut: statut.value }); afficherBibliotheque(); });
    const notes = el('textarea');
    notes.id = 'projet-info-notes';
    notes.value = infos.notes;
    notes.placeholder = 'Tes notes : réglages essayés, ce qui a marché, ce qu\'il reste à faire…';
    notes.addEventListener('change', () => { app.projet.definirInfos({ notes: notes.value }); afficherBibliotheque(); });
    contenu.push(champ('Dossier (pour ranger le projet)', dossier), champ('Avancement', statut), champ('Notes', notes));
    const boutons = el('div', 'projet-boutons');
    for (const [id, libelle, action, plein] of [['projet-enregistrer', 'Enregistrer le projet', () => app.projet.enregistrer(), true],
      ['projet-preparer', 'Aller à la préparation', () => app.allerA('preparer'), false]]) {
      const bouton = el('button', 'bouton' + (plein ? ' plein' : ''), libelle);
      bouton.id = id;
      bouton.addEventListener('click', async () => { await action(); afficher(); });
      boutons.append(bouton);
    }
    contenu.push(boutons, el('p', 'aide', 'Le dossier, l\'avancement et les notes sont enregistrés avec le projet.'));
    zone.replaceChildren(...contenu);
  }

  function afficherBibliotheque() {
    const projets = app.projet.bibliotheque();
    const dossiers = [...new Set(projets.map((x) => x.dossier).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    // Les dossiers connus sont proposés quand on range un projet.
    let liste = $('liste-dossiers');
    if (!liste) { liste = el('datalist'); liste.id = 'liste-dossiers'; document.body.append(liste); }
    liste.replaceChildren(...dossiers.map((d) => new Option(d, d)));
    const remplir = (id, premiere, choix, valeur) => {
      const select = $(id);
      select.replaceChildren(new Option(premiere, ''), ...choix.map(([v, t]) => new Option(t, v, false, v === valeur)));
    };
    remplir('projet-dossier', 'Dossier : tous', [...dossiers.map((d) => [d, d]), ['__aucun', 'Sans dossier']], filtre.dossier);
    remplir('projet-statut', 'Avancement : tous', STATUTS, filtre.statut);
    const cherche = sansAccent(filtre.recherche.trim());
    const visibles = projets.filter((x) => (!filtre.dossier || (filtre.dossier === '__aucun' ? !x.dossier : x.dossier === filtre.dossier)) &&
      (!filtre.statut || x.statut === filtre.statut) &&
      (!cherche || sansAccent(`${x.nom} ${x.modele} ${x.dossier} ${x.notes}`).includes(cherche)));
    const zone = $('projet-liste');
    if (!projets.length) {
      zone.replaceChildren(el('p', 'aide', 'Aucun projet enregistré pour l\'instant. Ouvre un modèle, prépare-le, puis clique sur « Enregistrer le projet » : il apparaîtra ici, et tu pourras le rouvrir d\'un clic.'));
      return;
    }
    if (!visibles.length) { zone.replaceChildren(el('p', 'aide', 'Aucun projet ne correspond à ces filtres.')); return; }
    const courant = app.projet.etat().cheminProjet;
    zone.replaceChildren(...visibles.map((x) => {
      const fiche = el('div', 'projet-fiche' + (x.chemin === courant ? ' courant' : ''));
      fiche.id = 'projet-' + (projets.indexOf(x) + 1);
      const texte = el('div');
      texte.append(el('b', '', x.nom), el('small', '', `${x.modele} · enregistré le ${x.date}`), el('small', '', x.chemin));
      const etiquettes = el('div', 'etiquettes');
      etiquettes.append(el('span', `pastille statut-${x.statut}`, STATUTS.find(([v]) => v === x.statut)?.[1] ?? 'Idée'));
      if (x.dossier) etiquettes.append(el('span', 'pastille', x.dossier));
      if (x.notes) etiquettes.append(el('span', 'pastille', x.notes.length > 60 ? x.notes.slice(0, 57) + '…' : x.notes));
      texte.append(etiquettes);
      const actions = el('div', 'actions');
      const ouvrir = el('button', 'bouton fin', x.chemin === courant ? 'Ouvert' : 'Ouvrir');
      ouvrir.disabled = x.chemin === courant;
      ouvrir.addEventListener('click', async () => { await app.projet.ouvrir(x.chemin); afficher(); });
      const retirer = el('button', 'bouton-icone');
      retirer.title = 'Retirer de la liste (le fichier du projet n\'est pas supprimé)';
      retirer.setAttribute('aria-label', `Retirer ${x.nom} de la liste`);
      retirer.append(icone('supprimer'));
      retirer.addEventListener('click', () => { app.projet.retirer(x.chemin); afficherBibliotheque(); });
      actions.append(ouvrir, retirer);
      fiche.append(texte, actions);
      return fiche;
    }));
  }

  function afficher() { afficherCourant(); afficherBibliotheque(); }
  $('projet-dossier').addEventListener('change', (e) => { filtre.dossier = e.target.value; afficherBibliotheque(); });
  $('projet-statut').addEventListener('change', (e) => { filtre.statut = e.target.value; afficherBibliotheque(); });
  $('projet-recherche').addEventListener('input', (e) => { filtre.recherche = e.target.value; afficherBibliotheque(); });
  $('projet-nouveau').addEventListener('click', async () => { await app.projet.nouveau(); afficher(); });
  $('projet-ouvrir-fichier').addEventListener('click', async () => { await app.projet.ouvrir(); afficher(); });
  $('vue-projet').addEventListener('click', afficher);
  afficher();
  return { afficher };
}

// --- Gestionnaire de bobines ------------------------------------------------------

function brancherGestionnaire(app) {
  const filtre = { montee: false, marque: '', matiere: '', recherche: '' };
  const replies = new Set();      // matières dont le groupe est replié
  let aSupprimer = null;          // bobine dont la suppression attend une confirmation

  function listeDeroulante(id, titre, valeurs, courant) {
    const liste = $(id);
    liste.replaceChildren(new Option(titre, ''), ...valeurs.map((v) => new Option(v, v)));
    liste.value = valeurs.includes(courant) ? courant : '';
    return liste.value;
  }

  function afficher() {
    const { etat } = app;
    const unique = (cle) => [...new Set(etat.bobines.map((b) => b[cle]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    filtre.marque = listeDeroulante('gestion-marque', 'Marque : toutes', unique('marque'), filtre.marque);
    filtre.matiere = listeDeroulante('gestion-matiere', 'Matière : toutes', unique('matiere'), filtre.matiere);
    for (const [id, actif] of [['gestion-toutes', !filtre.montee], ['gestion-montee', filtre.montee]]) {
      $(id).classList.toggle('actif', actif);
      $(id).setAttribute('aria-pressed', String(actif));
    }

    const cherche = sansAccent(filtre.recherche.trim());
    const visibles = etat.bobines.filter((b) => (!filtre.montee || b.id === etat.montee) &&
      (!filtre.marque || b.marque === filtre.marque) && (!filtre.matiere || b.matiere === filtre.matiere) &&
      (!cherche || sansAccent(`${b.nom} ${b.marque} ${b.matiere}`).includes(cherche)));

    const table = $('gestion-table');
    const tete = el('div', 'g-tete');
    tete.append(el('span', '', 'Bobine'), el('span', '', 'Restant'), el('span', '', 'Actions'));
    table.replaceChildren(tete);
    if (!visibles.length) {
      table.append(el('div', 'vide', etat.bobines.length ? 'Aucune bobine ne correspond à ces filtres.'
        : 'Aucune bobine enregistrée. Ajoute-en une avec « Ajouter une bobine ».'));
      return;
    }
    for (const matiere of [...new Set(visibles.map((b) => b.matiere))]) {
      const groupe = visibles.filter((b) => b.matiere === matiere);
      const ouvert = !replies.has(matiere);
      const titre = el('button', 'g-groupe');
      titre.setAttribute('aria-expanded', String(ouvert));
      titre.append(icone('chevron-bas'), el('span', '', matiere), el('span', 'compte', String(groupe.length)),
        el('span', '', `${entier(groupe.reduce((somme, b) => somme + b.poids_restant, 0))} g`));
      titre.addEventListener('click', () => { if (ouvert) replies.add(matiere); else replies.delete(matiere); afficher(); });
      table.append(titre);
      if (ouvert) table.append(...groupe.map(rang));
    }
  }

  function rang(b) {
    const { etat } = app;
    const montee = b.id === etat.montee;
    const ligne = el('div', 'g-rang');
    ligne.id = 'g-' + b.id;
    const couleur = el('span', 'g-couleur');
    couleur.style.background = b.couleur;
    const nom = el('div', 'g-nom');
    const titre = el('b', '', b.nom);
    if (montee) titre.append(el('span', 'g-montee', 'MONTÉE'));
    const detail = el('small');
    const carre = el('span', 'carre');
    carre.style.background = b.couleur;
    detail.append(document.createTextNode(`${String(b.diametre).replace('.', ',')} mm | `), carre,
      document.createTextNode(`${b.couleur.toUpperCase()}${b.marque ? ' · ' + b.marque : ''} · buse ${b.temp_buse} °C · plateau ${b.temp_plateau} °C`));
    nom.append(titre, detail);

    const part = Math.max(0, Math.min(1, b.poids_restant / b.poids_bobine));
    const reste = el('div', 'g-reste');
    const jauge = el('div', 'jauge' + (part < 0.15 ? ' bas' : ''));
    const niveau = el('span');
    niveau.style.width = `${part * 100}%`;
    jauge.append(niveau);
    reste.append(el('span', '', `${entier(b.poids_restant)} g / ${entier(b.poids_bobine)} g`), jauge);

    const actions = el('div', 'g-actions');
    const bouton = (id, dessin, titreBouton, action, inactif = false) => {
      const element = el('button', 'bouton-icone');
      element.id = `${id}-${b.id}`;
      element.title = titreBouton;
      element.setAttribute('aria-label', titreBouton);
      element.disabled = inactif;
      element.append(icone(dessin));
      element.addEventListener('click', action);
      return element;
    };
    if (aSupprimer === b.id) {
      const confirmer = el('button', 'confirmer', 'Supprimer ?');
      confirmer.id = 'g-confirmer-' + b.id;
      confirmer.addEventListener('click', () => {
        etat.bobines = etat.bobines.filter((x) => x.id !== b.id);
        if (etat.montee === b.id) etat.montee = etat.bobines[0]?.id ?? null;
        aSupprimer = null;
        app.enregistrerBobines();
        app.afficherBobine();
        app.dire(`Bobine « ${b.nom} » supprimée.`, { info: true });
      });
      const garder = bouton('g-garder', 'fermer', 'Ne pas supprimer', () => { aSupprimer = null; afficher(); });
      actions.append(confirmer, garder);
    } else {
      actions.append(
        bouton('g-monter', 'imprimante', montee ? 'Bobine déjà montée sur l\'imprimante' : 'Monter sur l\'imprimante',
          () => app.monterBobine(b.id), montee),
        bouton('g-modifier', 'modifier', 'Modifier la bobine', () => app.ouvrirBibliotheque(b.id)),
        bouton('g-supprimer', 'supprimer', 'Supprimer la bobine', () => { aSupprimer = b.id; afficher(); }));
    }
    ligne.append(couleur, nom, reste, actions);
    return ligne;
  }

  $('gestion-toutes').addEventListener('click', () => { filtre.montee = false; afficher(); });
  $('gestion-montee').addEventListener('click', () => { filtre.montee = true; afficher(); });
  $('gestion-marque').addEventListener('change', (e) => { filtre.marque = e.target.value; afficher(); });
  $('gestion-matiere').addEventListener('change', (e) => { filtre.matiere = e.target.value; afficher(); });
  $('gestion-recherche').addEventListener('input', (e) => { filtre.recherche = e.target.value; afficher(); });
  $('gestion-ajouter').addEventListener('click', () => app.ouvrirBibliotheque(app.nouvelleBobine()));

  return { afficher };
}
