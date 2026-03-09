# Appliance Power Usage Signatures — Reference Guide

> **Purpose**: This document catalogs the known power consumption signatures of common
> household appliances, based on research in Non-Intrusive Load Monitoring (NILM) and
> energy disaggregation. It is intended to serve as a reference for the power-monitor
> project to help identify *what* is consuming power based on observable patterns in
> whole-house meter data.

---

## Table of Contents

1. [Background — NILM & Energy Disaggregation](#1-background)
2. [Signature Feature Taxonomy](#2-signature-feature-taxonomy)
3. [Appliance Signature Catalog](#3-appliance-signature-catalog)
4. [Your EV — 2022 Chevrolet Bolt](#4-your-ev--2022-chevrolet-bolt)
5. [Machine-Readable Signature Table (JSON-ready)](#5-machine-readable-signature-table)
6. [Detection Approach for This Project](#6-detection-approach-for-this-project)
7. [Public NILM Datasets](#7-public-nilm-datasets)
8. [References](#8-references)

---

## 1. Background

**Non-Intrusive Load Monitoring (NILM)**, also called *energy disaggregation*, is a
technique for decomposing an aggregate electrical signal (e.g., a single whole-house
meter) into the contributions of individual appliances — *without* per-appliance
sub-meters.

The foundational insight is that every appliance draws power in a characteristic way
— its **power signature** — and these signatures are sufficiently distinct to be
separated from the combined signal.

### Core Principles

| Concept | Description |
|---------|-------------|
| **Step Change** | A sudden increase/decrease in power when an appliance turns on/off. Simplest feature. |
| **Steady-State Power** | The stable wattage an appliance draws while running (real + reactive power). |
| **Transient Signature** | Brief spike or ringing at power-on before settling to steady state. |
| **Load Shape / Duty Cycle** | The temporal pattern of operation (e.g., a refrigerator compressor cycles on/off). |
| **Reactive Power (Q)** | Power drawn by inductive/capacitive loads (motors, transformers). Helps differentiate appliances with similar real power. |
| **Harmonic Content** | Non-linear loads (e.g., electronics, LED drivers) distort the current waveform, creating identifiable harmonic frequencies. |

---

## 2. Signature Feature Taxonomy

### 2.1 Step Magnitude (ΔP)
The size of the power jump when an appliance turns on or off. Measured in watts.

### 2.2 Duration
How long the appliance typically runs per activation.

### 2.3 Duty Cycle Pattern
Whether the appliance cycles on/off periodically (e.g., refrigerator compressor ~30 min on, ~30 min off).

---

## 3. Appliance Signature Catalog

### 3.1 🔌 Electric Vehicle Charger (Level 2)
- **Wattage**: 3,300–11,500 W
- **Pattern**: Flat plateau for hours. Largest house load.
- **Difficulty**: 🟢 Easy

### 3.2 🍲 Microwave
- **Wattage**: 600–1,800 W
- **Pattern**: Constant draw or rapid pulsing at low settings.
- **Difficulty**: 🟢 Easy

### 3.3 🍽️ Dishwasher
- **Wattage**: 500–2,400 W
- **Pattern**: Multi-phase (fill, wash, drain, heat-dry).
- **Difficulty**: 🟡 Medium

### 3.4 🧊 Refrigerator / Freezer
- **Wattage**: 100–400 W (Running) / 1,200 W (Startup)
- **Pattern**: Periodic cycling 24/7.
- **Difficulty**: 🟢 Easy

### 3.5 🧊 Standalone Freezer
- **Wattage**: 50–200 W
- **Pattern**: Longer off periods than a fridge.
- **Difficulty**: 🟡 Medium

### 3.6 ❄️ Mini-Split Heat Pump
- **Wattage**: 500–5,500 W
- **Pattern**: Continuously variable inverter. No sharp edges.
- **Difficulty**: 🔴 Hard

### 3.7 ❄️ Central / Window AC
- **Wattage**: 500–5,000 W
- **Pattern**: Sharp on/off with startup surge.
- **Difficulty**: 🟢 Easy

### 3.8 🔥 Electric Range / Cooktop
- **Wattage**: 1,000–3,000 W per burner
- **Pattern**: Intermittent cycling to maintain temp.
- **Difficulty**: 🟡 Medium

### 3.9 🔥 Electric Oven
- **Wattage**: 2,000–5,000 W
- **Pattern**: Continuous preheat then duty-cycling.
- **Difficulty**: 🟡 Medium

### 3.10 🍞 Toaster
- **Wattage**: 800–1,500 W
- **Pattern**: Simple on/off, 2–5 min.
- **Difficulty**: 🟢 Easy

### 3.11 🍞 Toaster Oven
- **Wattage**: 1,200–1,800 W
- **Pattern**: Like a small oven, 5–20 min.
- **Difficulty**: 🟡 Medium

### 3.12 🔥 Space Heater
- **Wattage**: 750 / 1,500 W
- **Pattern**: Long duration, seasonal.
- **Difficulty**: 🟡 Medium

### 3.13 📺 Television (LED/OLED)
- **Wattage**: 30–250 W
- **Pattern**: Static draw, very low magnitude.
- **Difficulty**: 🔴 Hard

### 3.14 💻 Computer (Laptop/Desktop/Gaming)
- **Wattage**: 20W (Laptop) to 800W+ (Gaming PC)
- **Pattern**: Rapid fluctuations during gaming load.
- **Difficulty**: 🟡 Medium

### 3.15 🎮 Game Console (PS5 / Xbox Series X)
- **Wattage**: 150–220 W
- **Pattern**: Stable high draw during gameplay.
- **Difficulty**: 🟡 Medium

### 3.16 💇 Hair Dryer
- **Wattage**: 1,000–2,100 W
- **Pattern**: Very stable, flat signature.
- **Difficulty**: 🟢 Easy

### 3.17 💇 Curling Iron / Flat Iron
- **Wattage**: 40–90 W
- **Pattern**: Duty-cycling once hot. Low magnitude.
- **Difficulty**: 🔴 Hard

### 3.18 🧺 Washing Machine
- **Wattage**: 400–1,400 W
- **Pattern**: Rhythmic motor pulses + heating.
- **Difficulty**: 🟡 Medium

### 3.19 🧺 Clothes Dryer (Electric)
- **Wattage**: 1,500–5,000 W
- **Pattern**: High magnitude cycling heaters.
- **Difficulty**: 🟢 Easy

### 3.20 ☕ Coffee Maker
- **Wattage**: 550–1,500 W
- **Pattern**: Heat-up burst then warming pulses.
- **Difficulty**: 🟡 Medium

### 3.21 🫖 Electric Kettle
- **Wattage**: 1,200–3,000 W
- **Pattern**: Pure continuous high draw.
- **Difficulty**: 🟢 Easy

### 3.22 🧹 Vacuum Cleaner
- **Wattage**: 600–1,500 W
- **Pattern**: Manual operation, sustained draw.
- **Difficulty**: 🟡 Medium

### 3.23 🌀 Fan (Ceiling/Box)
- **Wattage**: 25–100 W
- **Pattern**: Continuous low-magnitude draw.
- **Difficulty**: 🔴 Hard

---

## 4. Your EV — 2022 Chevrolet Bolt

- **Level 2 Loading**: ~7.2 kW or ~11.5 kW
- **Charge Time**: 4–8 hours typical
- **Signature**: The most stable large load in the house. Purely flat plateau.

---

## 5. Machine-Readable JSON Data

Refer to [appliance_signatures.json](file:///Users/jleffers/Antigravity_PowerMon_Test/power-monitor/docs/appliance_signatures.json) for full detection rule definitions.

---

## 6. Detection Approach for This Project

(See original document for Phase 1-3 details)

---

## 7. Public NILM Datasets

(REDD, UK-DALE, REFIT, etc.)
