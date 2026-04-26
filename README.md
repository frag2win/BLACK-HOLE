# Real-Time Black Hole Simulation

![Simulation Preview](./docs/images/simulation_preview.png)

![Black Hole Simulation](https://img.shields.io/badge/Status-Development-orange)
![License](https://img.shields.io/badge/License-MIT-blue)
![Three.js](https://img.shields.io/badge/Three.js-r168-black)
![Vite](https://img.shields.io/badge/Vite-5.x-646CFF)

A physically-inspired, real-time simulation of a Schwarzschild black hole, featuring gravitational lensing effects and an accretion disk. This project is optimized for AI Studio and features Gemini AI integration.

## 🚀 Overview

This project aims to visualize the complex relativistic effects around a non-rotating (Schwarzschild) black hole. It provides a real-time interactive environment where users can observe light-bending phenomena and the dynamics of an accretion disk.

## ✨ Features

- **Physically Informed Physics**: Accurately calculates the Schwarzschild Radius ($r_s$), Photon Sphere ($1.5r_s$), and Innermost Stable Circular Orbit (ISCO, $3r_s$).
- **Gravitational Lensing**: Custom post-processing shaders simulate the bending of light paths around the singularity.
- **Dynamic Accretion Disk**: Procedural disk rendering with particle-like effects and orbital mechanics.
- **Interactive Controls**: Fluid orbit controls for observing the black hole from various distances and angles.
- **Real-Time Performance**: Optimized rendering loop capable of maintaining high frame rates at modern resolutions.

## 🛠️ Technology Stack

- **Core**: [Three.js](https://threejs.org/) (WebGL Framework)
- **Math**: [gl-matrix](https://glmatrix.net/)
- **AI**: [Gemini AI](https://deepmind.google/technologies/gemini/) (Integration Support)
- **Shaders**: custom GLSL (Vertex & Fragment)
- **Build Tool**: [Vite](https://vitejs.dev/)

## 📦 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/frag2win/BLACK-HOLE.git
   cd BLACK-HOLE
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:3000`.

## 🔬 Physics Context

The simulation centers on a **Schwarzschild Black Hole**, which is the simplest type of black hole—one that has mass but no electric charge or angular momentum. 

- **Schwarzschild Radius ($r_s$):** The radius of the event horizon.
- **Photon Sphere ($1.5r_s$):** The distance at which photons are forced to travel in orbits.
- **ISCO ($3r_s$):** The closest stable orbit for massive particles.

## 🗺️ Project Structure

```text
├── src/
│   ├── core/           # Scene management and render loop
│   ├── physics/        # Black hole logic and unit converters
│   ├── rendering/      # Three.js object wrappers and post-processing
│   ├── shaders/        # GLSL code for lensing and disk effects
│   ├── utils/          # Constants and math helpers
│   └── main.js         # Entry point
├── index.html          # Main HTML entry
└── vite.config.js      # Vite configuration
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
