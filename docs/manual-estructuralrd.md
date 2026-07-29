# Manual de Usuario — EstrucCalc RD Pro

**Aplicación:** EstrucCalc RD Pro  
**URL:** https://estructural.stpsoluciones.com  
**Acceso:** Red local de la oficina o VPN  
**Normativas:** NSRDom R-001, ACI 318-19, ACI 530-13, ASCE 7-22  
**Unidades:** kgf/cm², ton, cm, ton·m

---

## 1. Acceso

1. Abre el navegador y entra a **https://estructural.stpsoluciones.com**
2. La aplicación carga directamente (no requiere usuario ni contraseña)
3. En el menú lateral selecciona el módulo de cálculo que necesitas

---

## 2. Organización de módulos

La app está organizada en tres sistemas estructurales:

```
EstrucCalc RD Pro
├── Estructura Aporticada (hormigón armado)
│   ├── Losas
│   ├── Vigas
│   ├── Columnas
│   └── Fundaciones (Zapata Aislada)
│
├── Mampostería Confinada
│   ├── Muros
│   ├── Vigas de Amarre
│   ├── Columnas de Confinamiento
│   └── Fundaciones (Zapata Corrida)
│
└── Muros de Hormigón (Shear Walls)
    ├── Muros / Shear Walls
    ├── Losas
    └── Fundaciones (Zapata Corrida)
```

---

## 3. Estructura Aporticada

### 3.1 Losas

Calcula losas macizas de hormigón armado bajo ACI 318-19.

**Tipos disponibles:**
- **1 dirección** — losa con relación largo/ancho ≥ 2
- **2 direcciones** — losa con relación largo/ancho < 2 (Método de Diseño Directo §8.10)

**Datos de entrada (1 dirección):**

| Campo | Descripción |
|---|---|
| f'c | Resistencia del hormigón (kgf/cm²) |
| fy | Resistencia del acero (kgf/cm²) |
| Condición de apoyo | Simple, continuo un extremo, continuo ambos extremos |
| Carga muerta (CM) | kg/m² (sin peso propio) |
| Carga viva (CV) | kg/m² |
| Longitud libre (Ln) | metros |

**Resultados:** espesor mínimo, carga última Wu, Mu, As requerido, barra seleccionada, espaciamiento, verificación de corte.

---

### 3.2 Vigas

Diseño de viga rectangular bajo ACI 318-19 con confinamiento sísmico SMF (§18.6).

**Datos de entrada:**

| Campo | Descripción |
|---|---|
| f'c, fy | Materiales (kgf/cm²) |
| b, h | Base y altura de la sección (cm) |
| Mu | Momento último (ton·m) |
| Vu | Cortante último (ton) |

**Resultados:** As flexión, estribos de confinamiento (zona y campo), diagrama de cortante.

---

### 3.3 Columnas

Diseño de columna rectangular con generación del **diagrama de interacción P-M** bajo ACI 318-19 (§10) con confinamiento SMF (§18.7.5).

**Datos de entrada:**

| Campo | Descripción |
|---|---|
| f'c, fy | Materiales (kgf/cm²) |
| b, h | Dimensiones de la sección (cm) |
| Pu, Mu | Carga axial y momento últimos por combinación de carga |
| Recubrimiento | cm |

**Resultados:**
- Área de acero As seleccionado
- Gráfico del diagrama P-M (curva φPn-φMn en azul, demanda en verde/rojo)
- Estribos de confinamiento: zona (Ash, So) y campo
- Verificación de cada combinación de carga (cumple ✓ / falla ✗)

> **Nota:** Los puntos de demanda dentro de la curva azul indican que la columna cumple. Puntos fuera de la curva indican que hay que aumentar sección o acero.

---

### 3.4 Fundaciones — Zapata Aislada

Diseño de zapata cuadrada bajo carga axial y momento.

**Datos de entrada:** cargas de servicio y sísmicas, dimensiones de columna, capacidad admisible del suelo, profundidad de desplante.

**Resultados:** dimensiones de zapata, verificación de presiones, punzonado, cortante en una dirección y flexión. Acero en ambas direcciones.

---

## 4. Mampostería Confinada

### 4.1 Muros

Diseño de muros de mampostería bajo cargas laterales (ACI 530-13, Método ASD).

**Datos de entrada:** dimensiones del muro, cargas gravitacionales, carga sísmica (la app calcula la sísmica con los parámetros NSRDom).

**Resultados:** verificación de esfuerzo axial, flexión y cortante; refuerzo horizontal y vertical mínimo.

---

### 4.2 Vigas de Amarre

Diseño de vigas de amarre (coronas) en mampostería.

**Datos de entrada:** luz libre, cargas tributarias, dimensiones de sección.

**Resultados:** As flexión, estribos, verificaciones.

---

### 4.3 Columnas de Confinamiento

Diseño de columnas de confinamiento (pilastras).

**Datos de entrada:** altura de muro, cargas sísmicas, sección.

**Resultados:** refuerzo longitudinal y transversal, verificaciones.

---

### 4.4 Zapata Corrida (Mampostería)

Diseño de fundación corrida bajo muro de mampostería.

**Resultados:** ancho, espesor y acero transversal de la zapata.

---

## 5. Muros de Hormigón (Shear Walls)

### 5.1 Muros / Shear Walls

Diseño según ACI 318-19 §11. La resistencia a cortante αc se calcula automáticamente según la relación hw/Lw del muro.

**Datos de entrada:** dimensiones del muro, cargas (Pu, Mu, Vu).

**Resultados:** ρh y ρv mínimos, φVn, φPn, verificaciones.

---

## 6. Análisis Sísmico (automático)

Todos los módulos que requieren carga sísmica usan el motor de cálculo integrado bajo **NSRDom R-001**:

**Datos requeridos:**
- Zona sísmica (1 a 4)
- Tipo de suelo (A, B, C, D, E)
- Número de pisos y altura total
- Peso sísmico total

**Resultados del análisis sísmico:**
- Período fundamental T (método aproximado NSRDom)
- Factores Fa y Fv
- Coeficiente sísmico Cs
- Cortante basal V
- Distribución de fuerzas por piso Fx

---

## 7. Resumen y PDF

Al completar todos los módulos de un sistema:

1. Ve a la sección **Resumen** del menú lateral
2. Verás una tabla con el estado (✓/✗) de cada módulo calculado
3. Para generar el PDF, haz clic en **Imprimir** (o Ctrl+P) y selecciona **"Guardar como PDF"** como destino

El PDF incluye toda la memoria de cálculo con pasos, fórmulas, norma aplicada, sustitución numérica y resultado.

---

## 8. Flujo de trabajo recomendado

Para un proyecto de estructura aporticada completo, el orden recomendado es:

```
1. Losas        → determina cargas para vigas
2. Vigas        → obtiene reacciones para columnas
3. Columnas     → verifica sección y acero
4. Fundaciones  → diseña con las cargas de columnas
5. Resumen      → revisa verificaciones y genera PDF
```

---

## Consideraciones importantes

- **Longitud de desarrollo en zapatas:** La longitud de desarrollo recta frecuentemente excede el vuelo disponible de la zapata. En ese caso, usar **ganchos estándar** (ld efectivo = 0.7 × ld recto).
- **Unidades:** La app solo trabaja en **kgf/cm², ton y cm**. No ingreses datos en MPa, kN o mm.
- **Zona sísmica RD:** La República Dominicana usa las zonas 1 (baja) a 4 (muy alta). Santo Domingo y el Cibao están en zona 3 y 4 respectivamente.
