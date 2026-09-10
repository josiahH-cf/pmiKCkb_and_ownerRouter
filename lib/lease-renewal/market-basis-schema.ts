import { z } from "zod";
const chargeMoney = z.number().finite().nonnegative();
const positiveMoney = z.number().finite().positive();
export const RenewalMarketBasisSchema = z
  .object({
    rangeLow: chargeMoney.optional(),
    rangeHigh: chargeMoney.optional(),
    pmiNumber: chargeMoney.optional(),
    compSource: z.string().trim().min(1).max(100).optional(),
    compRetrievedAt: z.string().trim().min(1).max(40).optional(),
    // S60: the provider-retrieved basis, persisted verbatim beside (never over) the typed
    // fields. The normalizer re-validates coherence; the schema bounds shape and size.
    provider: z
      .object({
        source: z.string().trim().min(1).max(60),
        rangeLow: chargeMoney,
        rangeHigh: chargeMoney,
        pointEstimate: chargeMoney,
        compCount: z.number().int().positive().max(100),
        retrievedAt: z.string().trim().min(1).max(40),
        radiusMiles: chargeMoney.optional(),
        requestedCompCount: z.number().int().positive().max(100).optional(),
        lookupSubjectAttributes: z.boolean().optional(),
        providerVersion: z.string().trim().min(1).max(80).optional(),
        cacheState: z.enum(["live", "cache"]).optional(),
        omittedAttributes: z
          .array(
            z
              .object({
                field: z.enum(["bedrooms", "bathrooms", "squareFootage", "propertyType"]),
                reason: z.string().trim().min(1).max(240),
              })
              .strict(),
          )
          .max(4)
          .optional(),
        unitFilters: z
          .object({
            bedrooms: chargeMoney.optional(),
            bathrooms: chargeMoney.optional(),
            squareFootage: chargeMoney.optional(),
            propertyType: z.string().trim().min(1).max(50).optional(),
          })
          .strict()
          .optional(),
        subjectProperty: z
          .object({
            propertyType: z.string().trim().min(1).max(50).optional(),
            bedrooms: chargeMoney.optional(),
            bathrooms: chargeMoney.optional(),
            squareFootage: positiveMoney.optional(),
          })
          .strict()
          .optional(),
        comps: z
          .array(
            z
              .object({
                rent: chargeMoney,
                correlation: z.number().min(0).max(1).optional(),
                distanceMiles: chargeMoney.optional(),
                propertyType: z.string().trim().min(1).max(50).optional(),
                bedrooms: chargeMoney.optional(),
                bathrooms: chargeMoney.optional(),
                squareFootage: positiveMoney.optional(),
                listedDate: z.string().trim().min(1).max(40).optional(),
                lastSeenDate: z.string().trim().min(1).max(40).optional(),
                daysOld: chargeMoney.optional(),
                daysOnMarket: chargeMoney.optional(),
              })
              .strict(),
          )
          .max(50)
          .optional(),
        trend: z
          .object({
            zipCode: z
              .string()
              .trim()
              .regex(/^\d{5}$/),
            retrievedAt: z.string().trim().min(1).max(40),
            months: z.record(
              z.string().regex(/^\d{4}-\d{2}$/),
              z
                .object({
                  averageRent: chargeMoney.optional(),
                  medianRent: chargeMoney.optional(),
                })
                .strict(),
            ),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
