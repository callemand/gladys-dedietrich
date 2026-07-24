# De Dietrich

Pilotez votre système de chauffage connecté De Dietrich depuis Gladys Assistant,
via le cloud **De Dietrich** (le même service que celui utilisé par
l'application mobile De Dietrich, reposant sur la plateforme BDR Thermea).

## Fonctionnalités

- **Chauffage (zones climat)** — lecture de la température ambiante et
  lecture/réglage de la température de consigne de chaque zone de chauffage.
  Régler une température applique une dérogation temporaire lorsque la zone suit
  son programme, ou la bascule en mode manuel sinon, exactement comme dans
  l'application.
- **Eau chaude sanitaire (ECS)** — lecture de la température d'eau actuelle et
  lecture/réglage de la consigne confort de chaque zone d'eau chaude.
- **Capteurs de la chaudière** — lecture de la température extérieure et de la
  pression d'eau de l'appareil.
- **Consommation d'énergie** — lecture de l'énergie cumulée consommée pour le
  chauffage et l'eau chaude sanitaire (en kWh), lorsque l'appareil la remonte.
  Ce sont des index de type compteur qui alimentent les graphes d'énergie de
  Gladys.

## Configuration

1. Installez l'intégration depuis la boutique d'intégrations de Gladys.
2. Ouvrez sa configuration et renseignez l'**e-mail** et le **mot de passe** de
   votre compte De Dietrich (les mêmes identifiants que dans
   l'application mobile De Dietrich).
3. Rendez-vous dans l'onglet **Découverte** et lancez un scan : vos zones de
   chauffage, vos zones d'eau chaude et votre chaudière apparaissent et peuvent
   être ajoutées à Gladys.

Vos appareils sont interrogés une fois par minute. Les consignes de chauffage et
d'eau chaude que vous modifiez depuis Gladys sont envoyées directement au cloud
De Dietrich.

## Remarques

- Cette intégration communique avec le cloud De Dietrich : une connexion
  internet et un compte De Dietrich fonctionnel sont nécessaires.
- Vos identifiants sont stockés chiffrés par Gladys et servent uniquement à
  vous authentifier auprès du cloud De Dietrich.
