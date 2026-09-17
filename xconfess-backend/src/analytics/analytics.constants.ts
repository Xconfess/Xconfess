/**
 * Privacy and security constants for analytics aggregation.
 * MIN_COHORT_SIZE defines the minimum number of records required in an aggregated
 * bucket before exposing the count. Buckets below this threshold are suppressed
 * to prevent de-anonymization via small-cohort inference attacks.
 *
 * Reference: k-anonymity principle (Sweeney, 2002)
 */

export const ANALYTICS_PRIVACY = {
  /**
   * Minimum number of records in any aggregated cohort.
   * Examples: Daily Active Users, Daily Confession Count, Reaction Type Count.
   *
   * Set to 5 (balanced trade-off between privacy and utility):
   * - Prevents single-user or 2-3 user buckets from being exposed
   * - Allows reasonable statistical visibility for platform health metrics
   * - Supports typical retention and churn analysis requirements
   */
  MIN_COHORT_SIZE: 5,
};
