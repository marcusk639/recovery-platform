import { useState, useCallback } from 'react';
import { Activity } from '../entities/ActivityModel';

export interface UseActivityModalReturn {
  modalVisible: boolean;
  modalType: 'confirm' | 'dispute' | '';
  selectedActivity: Activity | null;
  loadingMessage: string;
  error: string;
  showModal: (type: 'confirm' | 'dispute', activity: Activity) => void;
  dismissModal: () => void;
  setModalVisible: (visible: boolean) => void;
  setError: (error: string) => void;
  setLoadingMessage: (msg: string) => void;
}

export function useActivityModal(): UseActivityModalReturn {
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'dispute' | 'confirm' | ''>('');
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(
    null,
  );
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState('');

  const showModal = useCallback(
    (type: 'confirm' | 'dispute', activity: Activity): void => {
      const loadingMsg =
        type === 'confirm' ? 'Confirming action...' : 'Disputing action...';
      setModalVisible(true);
      setSelectedActivity(activity);
      setModalType(type);
      setLoadingMessage(loadingMsg);
    },
    [],
  );

  const dismissModal = useCallback((): void => {
    setModalVisible(false);
  }, []);

  return {
    modalVisible,
    modalType,
    selectedActivity,
    loadingMessage,
    error,
    showModal,
    dismissModal,
    setModalVisible,
    setError,
    setLoadingMessage,
  };
}
