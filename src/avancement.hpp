// ArtPrint Slicer - licence AGPL v3
// Avancement du tranchage en cours, pour l'afficher pendant le calcul.
// Le tranchage le note au passage ; l'interface le lit depuis un autre fil
// d'exécution, sans rien attendre.
#pragma once

#include <atomic>

namespace artprint::avancement {

// Les grandes étapes d'un tranchage, dans l'ordre.
enum class Etape : int { repos = 0, preparation, trajectoires, ecriture, verification, fini };

namespace interne {
inline std::atomic<int> etape{0};
inline std::atomic<int> pour_mille{0};
}  // namespace interne

// Note l'étape en cours et sa part faite (de 0 à 1).
inline void noter(Etape etape, double part = 0.0) {
    interne::etape.store(static_cast<int>(etape), std::memory_order_relaxed);
    interne::pour_mille.store(static_cast<int>(1000.0 * (part < 0.0 ? 0.0 : part > 1.0 ? 1.0 : part)),
                              std::memory_order_relaxed);
}

inline Etape etape() { return static_cast<Etape>(interne::etape.load(std::memory_order_relaxed)); }
inline double part() { return interne::pour_mille.load(std::memory_order_relaxed) / 1000.0; }

// Avancement d'ensemble, de 0 à 100 : les trajectoires comptent pour 45 %,
// l'écriture pour 10 %, la vérification pour 45 %.
inline int pour_cent() {
    const double p = part();
    switch (etape()) {
        case Etape::repos: return 0;
        case Etape::preparation: return 2;
        case Etape::trajectoires: return static_cast<int>(3.0 + 42.0 * p);
        case Etape::ecriture: return static_cast<int>(45.0 + 10.0 * p);
        case Etape::verification: return static_cast<int>(55.0 + 44.0 * p);
        case Etape::fini: return 100;
    }
    return 0;
}

inline const char* nom() {
    switch (etape()) {
        case Etape::repos: return "";
        case Etape::preparation: return "Préparation";
        case Etape::trajectoires: return "Calcul des trajectoires";
        case Etape::ecriture: return "Écriture du G-code";
        case Etape::verification: return "Vérification du G-code";
        case Etape::fini: return "Terminé";
    }
    return "";
}

}  // namespace artprint::avancement
