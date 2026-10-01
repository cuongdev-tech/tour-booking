import { useTranslation } from 'react-i18next';

/**
 * Display labels for backend enum values.
 * API values are NEVER changed — only the rendered text is translated.
 * e.g. API sends "Beach", UI shows "Biển" / "Beach" / "ビーチ" / "해변" / "海滩".
 */
export function useEnumLabels() {
  const { t } = useTranslation();
  return {
    category: (v: string): string => {
      switch (v) {
        case 'Beach':
          return t('enums.categoryBeach');
        case 'Mountains':
          return t('enums.categoryMountains');
        case 'Culture':
          return t('enums.categoryCulture');
        case 'Relaxation':
          return t('enums.categoryRelaxation');
        default:
          return v;
      }
    },
    bookingStatus: (v: string): string => {
      switch (v) {
        case 'PENDING':
          return t('enums.statusPending');
        case 'CONFIRMED':
          return t('enums.statusConfirmed');
        case 'CANCELLED':
          return t('enums.statusCancelled');
        case 'COMPLETED':
          return t('enums.statusCompleted');
        default:
          return v;
      }
    },
    paymentMethod: (v: string): string => {
      switch (v) {
        case 'CASH':
          return t('enums.payCash');
        case 'BANK_TRANSFER':
          return t('enums.payBank');
        case 'CARD':
          return t('enums.payCard');
        default:
          return v;
      }
    },
    paymentStatus: (v: string): string => {
      switch (v) {
        case 'PENDING':
          return t('enums.statusPending');
        case 'AWAITING_CONFIRMATION':
          return t('enums.payAwaiting');
        case 'PAID':
          return t('enums.payPaid');
        case 'FAILED':
          return t('enums.payFailed');
        case 'REFUNDED':
          return t('enums.payRefunded');
        default:
          return v;
      }
    },
    role: (v: string): string => {
      switch (v) {
        case 'ADMIN':
          return t('enums.roleAdmin');
        default:
          return t('enums.roleCustomer');
      }
    },
    userStatus: (v: string): string => {
      switch (v) {
        case 'ACTIVE':
          return t('enums.userActive');
        default:
          return t('enums.userInactive');
      }
    },
    transportation: (v: string): string => {
      switch (v) {
        case 'Flight':
          return t('enums.transportFlight');
        case 'Bus':
          return t('enums.transportBus');
        case 'Coach':
          return t('enums.transportCoach');
        case 'PrivateCar':
          return t('enums.transportPrivateCar');
        case 'LocalTransfer':
          return t('enums.transportLocalTransfer');
        case 'Cruise':
          return t('enums.transportCruise');
        default:
          return v;
      }
    },
  };
}
