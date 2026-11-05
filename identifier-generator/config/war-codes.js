// DVA file number war codes (1-3 characters). DVA adds codes over time, so the
// validator treats an unknown code as a warning, not an error.
// Source: curmi.com/australian-health-identifiers (third party), 60 codes.
export const WAR_CODES = [
  'A', 'AGX', 'BUR', 'BW', 'CGW', 'CIV', 'CN', 'CNK', 'CNS', 'CNX',
  'FIJ', 'GHA', 'GW', 'HKS', 'HKX', 'IND', 'IV', 'KM', 'KYA', 'MAL',
  'MAU', 'MLS', 'MTX', 'MWI', 'N', 'NF', 'NG', 'NGR', 'NK', 'NRD',
  'NSM', 'NSS', 'NSW', 'NX', 'P', 'PAD', 'PAM', 'PCA', 'PCR', 'PCV',
  'PK', 'PMS', 'PSM', 'PSW', 'PWO', 'PX', 'Q', 'RD', 'RDX', 'SA',
  'SAX', 'SL', 'SM', 'SR', 'SS', 'SUD', 'SWP', 'TZA', 'X', 'ZZ',
];
