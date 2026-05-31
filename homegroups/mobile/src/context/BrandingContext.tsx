import React, {createContext, useContext, useEffect, useState} from 'react';
import {useAppDispatch, useAppSelector} from '../store';
import {loadBrandingForUser, selectBranding} from '../store/slices/brandingSlice';

export interface BrandingConfig {
  primaryColor: string;
  accentColor: string;
  orgName: string;
  logoUrl?: string;
  welcomeMessage?: string;
}

export const DEFAULT_BRANDING: BrandingConfig = {
  primaryColor: '#2196F3',
  accentColor: '#4CAF50',
  orgName: 'RecoveryConnect',
  logoUrl: undefined,
};

export const BrandingContext = createContext<BrandingConfig>(DEFAULT_BRANDING);

export const useBranding = () => useContext(BrandingContext);

interface BrandingProviderProps {
  children: React.ReactNode;
  homeGroupIds?: string[];
}

export const BrandingProvider: React.FC<BrandingProviderProps> = ({
  children,
  homeGroupIds,
}) => {
  const dispatch = useAppDispatch();
  const brandingDoc = useAppSelector(selectBranding);
  const [brandingConfig, setBrandingConfig] = useState<BrandingConfig>(DEFAULT_BRANDING);

  useEffect(() => {
    if (homeGroupIds && homeGroupIds.length > 0) {
      dispatch(loadBrandingForUser(homeGroupIds));
    }
  }, [dispatch, homeGroupIds?.join(',')]);

  useEffect(() => {
    if (brandingDoc) {
      setBrandingConfig({
        primaryColor: brandingDoc.primaryColor,
        accentColor: brandingDoc.accentColor,
        orgName: brandingDoc.orgName,
        logoUrl: brandingDoc.logoUrl,
        welcomeMessage: brandingDoc.welcomeMessage,
      });
    } else {
      setBrandingConfig(DEFAULT_BRANDING);
    }
  }, [brandingDoc]);

  return (
    <BrandingContext.Provider value={brandingConfig}>
      {children}
    </BrandingContext.Provider>
  );
};

export default BrandingProvider;
