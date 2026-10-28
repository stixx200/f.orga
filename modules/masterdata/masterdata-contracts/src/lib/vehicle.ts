import { z } from 'zod';
import { Aliases } from '@forga/core-contracts';
import { VEHICLE_STATISTICS_CATEGORY_IDS } from './vehicle-statistics-categories.js';

export const VehicleStatus = z.enum(['in-service', 'out-of-service', 'retired']);
export type VehicleStatus = z.infer<typeof VehicleStatus>;

export const VehicleInput = z.object({
  designation: z.string().trim().min(1),
  radioCallSign: z.string().trim().default(''),
  licensePlate: z.string().trim().default(''),
  /** Key of a `vehicle-type` catalog entry. */
  vehicleType: z.string().min(1),
  departmentId: z.uuid(),
  stationId: z.uuid().nullable().default(null),
  /** `null` = seats of the vehicle type. */
  seats: z.number().int().min(0).nullable().default(null),
  yearBuilt: z.number().int().min(1900).max(2200).nullable().default(null),
  commissionedOn: z.iso.date().nullable().default(null),
  decommissionedOn: z.iso.date().nullable().default(null),
  costRecoveryCategory: z.string().nullable().default(null),
  /** Position of the annual statistics (F63–F120). `null` = default of the vehicle type. */
  statisticsCategory: z
    .string()
    .refine((id) => VEHICLE_STATISTICS_CATEGORY_IDS.includes(id), 'Unknown statistics category')
    .nullable()
    .default(null),
  status: VehicleStatus.default('in-service'),
  notes: z.string().default(''),
  /** Other names imports match the vehicle by besides designation and radio call sign, e.g. an old designation. */
  aliases: Aliases,
});
export type VehicleInput = z.input<typeof VehicleInput>;

export const Vehicle = z.object({
  id: z.uuid(),
  designation: z.string(),
  radioCallSign: z.string(),
  licensePlate: z.string(),
  vehicleType: z.string(),
  departmentId: z.uuid(),
  stationId: z.uuid().nullable(),
  seats: z.number().int(),
  yearBuilt: z.number().int().nullable(),
  commissionedOn: z.string().nullable(),
  decommissionedOn: z.string().nullable(),
  costRecoveryCategory: z.string().nullable(),
  statisticsCategory: z.string(),
  status: VehicleStatus,
  notes: z.string(),
  aliases: z.array(z.string()),
  version: z.number().int(),
});
export type Vehicle = z.infer<typeof Vehicle>;

/**
 * Unambiguous name of a vehicle in selections and lists: designation, radio call sign and the short name of its
 * department, e.g. "Anhänger · Florian Musterstadt 1/90 (Musterstadt)". Designations like "Anhänger" repeat.
 */
export function vehicleLabel(vehicle: Pick<Vehicle, 'designation' | 'radioCallSign'>, department?: string | null): string {
  const name = [vehicle.designation, vehicle.radioCallSign].filter(Boolean).join(' · ');
  return department ? `${name} (${department})` : name;
}
