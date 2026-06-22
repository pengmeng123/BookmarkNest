import { useEffect, useState } from 'react';

import { isProActive } from '../../lib/license/pro';
import { validateStoredLicenseIfNeeded } from '../../lib/license/service';
import { emptyLicenseData } from '../../lib/storage/localStorage';
import type { LicenseData } from '../../shared/types';

export function useLicenseState() {
  const [license, setLicense] = useState<LicenseData>(emptyLicenseData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    validateStoredLicenseIfNeeded()
      .then((nextLicense) => {
        if (mounted) {
          setLicense(nextLicense);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  return {
    license,
    loading,
    isPro: isProActive(license)
  };
}
