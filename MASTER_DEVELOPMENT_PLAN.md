# FRESHLOOP AI: PLAN MAESTRO DE DESARROLLO Y ARQUITECTURA

## Contexto del Sistema
Eres un Arquitecto de Software Full-Stack Enterprise. Estás construyendo "FreshLoop AI", una plataforma de gestión de rendimiento, rescate de recetas e inventario dinámico para supermercados independientes.

## Reglas de Cumplimiento Estricto (Global Rules)
1. **Tecnologías Core:** Next.js 15 (App Router), React 19, Tailwind CSS v4, Prisma ORM, Supabase (PostgreSQL), `@google/generative-ai` (Gemini 1.5 Flash).
2. **Regla del Ledger Inmutable:** NUNCA crees columnas estáticas de "Stock Actual". El inventario siempre se calcula dinámicamente sumando la columna `Qty_Change` de la tabla `Inventory_Transactions`.
3. **Ubicación Obligatoria:** Todas las transacciones deben registrar `From_Location` y `To_Location` (ej. `Retail_Floor`, `Kitchen_Prep`, `Waste_Bin`).
4. **Bucle de Confirmación de IA (Async Confirmation):** Ningún modelo de IA (voz o visión) escribe directamente en la base de datos. Deben devolver un JSON estructurado para mostrar un modal UI de confirmación `[CONFIRMAR] / [EDITAR]`.
5. **Control de Acceso (RBAC):** Las ejecuciones de recetas (BOM) están restringidas exclusivamente al rol de personal de cocina.
6. **Ejecución por Fases:** Debes ejecutar este proyecto fase por fase. NO pases a la siguiente fase hasta que el usuario lo autorice explícitamente.

---

## FASE 1: ESQUEMA DE BASE DE DATOS Y SEEDING (Prisma)
- **Objetivo:** Crear el modelo de datos relacional normalizado en `schema.prisma`.
- **Modelos:**
  - `Product`: ID, Barcode, Name, Department, TargetMargin, UnitType.
  - `InventoryTransaction`: ID, Timestamp, Product_ID, Staff_ID, Qty_Change, Transaction_Type (Receive, Sale, Rescue, Waste, POS_Sale), From_Location, To_Location, Unit_Cost_At_Time, Reference_ID.
  - `StoreSetting`: ID, Target_Waste_Pct, Scrap_Bucket_Volume_L, Estimated_Weight_Per_Liter_kg.
  - `Recipe` y `RecipeBOM`: Define el producto resultante y sus ingredientes crudos.
  - `Bundle` y `BundleItem`: Para Virtual Kitting en el POS.
  - `POSMapping`: Vincula IDs internos con SKUs externos del POS.
- **Entregables:** `schema.prisma` y `prisma/seed.ts`.

---

## FASE 2: SERVICIOS CORE DEL LEDGER E INVENTARIO
- **Objetivo:** Construir las utilidades del servidor en TypeScript para los cálculos matemáticos del inventario.
- **Funciones en `lib/inventory.ts`:**
  - `getCurrentStock(productId, location)`: Suma transacciones del ledger.
  - `getMovingAverageCost(productId)`: Calcula el costo promedio ponderado basado en logs de recepción.
  - `executeBundleSale(bundleId)`: Función "Explode" de Virtual Kitting.
  - `calculateRealTimeWastePct()`: Fórmula `(Valor Descarte + Valor Scraps Volumétricos) / Ventas Brutas`.
- **Entregable:** `lib/inventory.ts` probado y verificado.

---

## FASE 3: ENDPOINTS DE IA Y MANUFACTURA
- **Objetivo:** Integrar SDK de Gemini 1.5 Flash y motor de producción de cocina.
- **Rutas API:**
  - `/api/voice-logger/route.ts`: Procesa audio a JSON (Item, Cantidad, Acción) con búsqueda difusa (fuzzy matching) si el nombre no coincide exactamente.
  - `/api/invoice-ocr/route.ts`: Procesa imágenes de facturas a JSON (Proveedor, Ítems, Costo). Incluye Cost Guardrail (alerta si el costo varía >20%).
  - `/api/manufacturing/route.ts`: Descuenta `RecipeBOM` de `Kitchen_Prep`, calcula costo de lote y añade producto final al ledger.
- **Entregables:** Rutas API en `/app/api/`.

---

## FASE 4: DASHBOARD DE CONTROL Y KPIS (Frontend)
- **Objetivo:** Construir el centro de mando del gerente.
- **Componentes UI:**
  - `app/dashboard/page.tsx`: Dashboard neumórfico/glassmorphic.
  - **Semáforo KPI de Merma:** Verde si Merma Actual < `Target_Waste_Pct`, Rojo parpadeante si lo supera.
  - **Slider de Retiro Humano:** Controles para 2, 3 y 4 días de sensibilidad de expiración.
  - **Tablas de Sub-Inventarios:** Vista separada para `Retail_Floor` y `Kitchen_Prep`.

---

## FASE 5: FLUJOS DE TRABAJO EN PISO Y SALVAGUARDAS
- **Objetivo:** Herramientas de interfaz sin fricción para el personal.
- **Componentes UI:**
  - `VoiceLoggerModal.tsx`: Bucle de confirmación asíncrono tras el parseo de voz.
  - `RecipeProductionModal.tsx`: Toggle de varianza (permite a cocineros ajustar el peso real usado si difiere del BOM).
  - `VolumetricScrapForm.tsx`: Registro en 1 clic de "X Cubetas de 20L".