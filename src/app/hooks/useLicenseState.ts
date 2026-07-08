import { useEffect, useState } from 'react';

import { isProActive } from '../../lib/license/pro';
import { validateStoredLicenseIfNeeded } from '../../lib/license/service';
import { emptyLicenseData, subscribeToLocalStateChanges } from '../../lib/storage/localStorage';
import type { LicenseData } from '../../shared/types';

const forcePro = import.meta.env.VITE_FORCE_PRO === 'true';

export function useLicenseState() {
  const forcedLicense: LicenseData = {
    ...emptyLicenseData,
    pro: true,
    licenseKey: 'dev-pro',
    email: 'dev@bookmarknest.local',
    activatedAt: new Date(0).toISOString(),
    lastValidatedAt: new Date(0).toISOString(),
    validationStatus: 'valid'
  };
  const [license, setLicense] = useState<LicenseData>(forcePro ? forcedLicense : emptyLicenseData);
  const [loading, setLoading] = useState(!forcePro);

  useEffect(() => {
    if (forcePro) {
      return;
    }

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

  useEffect(() => {
    if (forcePro) {
      return;
    }

    return subscribeToLocalStateChanges({
      onLicenseChange: setLicense
    });
  }, []);

  return {
    license,
    loading,
    isPro: forcePro || isProActive(license)
  };
}
