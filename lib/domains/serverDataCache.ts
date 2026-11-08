import { cache } from 'react';
import { getBuyListLevelsWithForecast } from '@/lib/domains/inventory/forecasting';
import { getStockLevels } from '@/lib/domains/inventory/stock';
import { loadProductionBootstrapData } from '@/lib/domains/manufacturing/productionBootstrap';

/** Request-scoped dedupe for RSC (pairs with in-process TTL caches in domain layers). */
export const getStockLevelsRsc = cache(() => getStockLevels());

export const getBuyListLevelsRsc = cache(() => getBuyListLevelsWithForecast());

export const loadProductionBootstrapRsc = cache(() => loadProductionBootstrapData());
