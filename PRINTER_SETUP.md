# Configuration Imprimante Thermique Epson TM-T20X

Ce guide vous explique comment configurer et utiliser l'imprimante thermique Epson TM-T20X avec l'application Nqlix.

## Prérequis

- Imprimante Epson TM-T20X
- Connexion Ethernet
- Node.js installé
- Application Nqlix compilée

## Configuration Réseau

### 1. Configuration de l'imprimante

1. **Connectez l'imprimante** à votre réseau via Ethernet
2. **Configurez l'adresse IP** de l'imprimante (par défaut: 192.168.1.100)
3. **Vérifiez le port** (par défaut: 9100)
4. **Testez la connectivité** avec un ping:
   ```bash
   ping 192.168.1.100
   ```

### 2. Configuration dans l'application

L'application Nqlix permet de configurer l'imprimante via l'interface utilisateur:

- **Adresse IP**: Adresse IP de l'imprimante sur le réseau
- **Port**: Port de communication (généralement 9100)
- **Largeur**: Nombre de caractères par ligne (48 pour TM-T20X)
- **Timeout**: Délai d'attente en millisecondes (5000ms)

## Fonctionnalités Disponibles

### Impression de Texte
- Texte simple avec alignement (gauche, centre, droite)
- Texte en gras et souligné
- Différentes tailles de police
- Lignes de séparation

### Codes-barres
- Support des codes-barres 1D (Code128, Code39, etc.)
- Codes-barres 2D (QR Code, PDF417, MaxiCode)
- Configuration personnalisable

### Tickets et Reçus
- Tickets de réservation formatés
- Reçus de paiement
- En-têtes et pieds de page personnalisés

## API Rust

L'application expose plusieurs commandes Tauri pour l'impression:

```rust
// Configuration
get_printer_config() -> PrinterConfig
update_printer_config(config: PrinterConfig) -> Result<()>

// Tests
test_printer_connection() -> PrinterStatus

// Impression
print_ticket(content: String) -> Result<String>
print_receipt(content: String) -> Result<String>
print_barcode(data: String, barcode_type: u8) -> Result<String>
print_qr_code(data: String) -> Result<String>
execute_print_job(job: PrintJob) -> Result<String>
```

## Service TypeScript

Le service `ThermalPrinterService` fournit une interface simple:

```typescript
import { thermalPrinter } from './services/thermalPrinterService';

// Configuration
await thermalPrinter.setPrinterIP('192.168.1.100');
await thermalPrinter.setPrinterPort(9100);

// Tests
const status = await thermalPrinter.testConnection();

// Impression
await thermalPrinter.printTicket('Contenu à imprimer');
await thermalPrinter.printQRCode('https://louaj.tn');
await thermalPrinter.printBarcode('1234567890', 73);

// Tickets formatés
await thermalPrinter.printBookingTicket({
  ticketNumber: 'TKT-001',
  passengerName: 'Ahmed Ben Ali',
  route: 'Tunis - Sfax',
  departureTime: '14:30',
  seatNumber: 'A12',
  price: '25.500',
  bookingDate: '16/09/2025'
});
```

## Test de l'Installation

### 1. Test via Script Node.js

```bash
cd /home/ivan/louaj/Nqlix
node scripts/test-printer.js
```

### 2. Test via Interface Utilisateur

1. Ouvrez l'application Nqlix
2. Naviguez vers "Configuration Imprimante"
3. Configurez l'adresse IP de votre imprimante
4. Cliquez sur "Tester Connexion"
5. Utilisez les boutons de test pour vérifier l'impression

## Dépannage

### Problèmes de Connexion

1. **Imprimante non trouvée**
   - Vérifiez l'adresse IP
   - Testez la connectivité réseau
   - Vérifiez que l'imprimante est allumée

2. **Timeout de connexion**
   - Augmentez la valeur du timeout
   - Vérifiez la stabilité du réseau
   - Redémarrez l'imprimante

3. **Erreurs d'impression**
   - Vérifiez le papier dans l'imprimante
   - Nettoyez la tête d'impression
   - Redémarrez l'imprimante

### Codes d'Erreur Courants

- **ECONNREFUSED**: L'imprimante refuse la connexion
- **ETIMEDOUT**: Timeout de connexion
- **ENOTFOUND**: Adresse IP introuvable

## Configuration Avancée

### Caractères Spéciaux

L'imprimante supporte plusieurs jeux de caractères:
- PC852_LATIN2 (par défaut)
- PC437_USA
- PC850_MULTILINGUAL
- Et bien d'autres...

### Formats de Codes-barres

#### Codes-barres 1D (Epson)
- UPC-A (65)
- UPC-E (66)
- JAN13 (67)
- JAN8 (68)
- Code39 (69)
- ITF (70)
- CODABAR (71)
- CODE93 (72)
- CODE128 (73)
- GS1-128 (74)

#### Codes-barres 2D
- QR Code
- PDF417
- MaxiCode

## Support

Pour toute question ou problème:
1. Vérifiez ce guide de dépannage
2. Consultez la documentation de l'imprimante Epson TM-T20X
3. Contactez l'équipe de développement

## Changelog

- **v1.0.0**: Configuration initiale de l'imprimante thermique
- Support complet des fonctionnalités Epson TM-T20X
- Interface utilisateur de configuration
- API Rust et service TypeScript
- Tests automatisés