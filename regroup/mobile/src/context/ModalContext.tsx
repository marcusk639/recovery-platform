import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { View } from 'react-native';
import RatsModalBase from '../components/rats-modal';
const RatsModal = RatsModalBase as any;
import RatsLoadingModal from '../components/rats-loading-modal';
import ScreenHeader from '../components/screen-header';
import { color, MODAL_STYLE, MODAL_CONTAINER_STYLE } from '../styles/theme';

/**
 * Modal Context Types
 */
interface FormModalState {
  visible: boolean;
  content: ReactNode;
  title: string;
  fullScreen: boolean;
  rightIcon?: JSX.Element;
  closeOnBack: boolean;
  renderBackButton: boolean;
}

interface LoadingModalState {
  visible: boolean;
  loading: boolean;
  success: boolean;
  error: any;
  message: string;
}

interface ModalContextType {
  // Form Modal
  showFormModal: (
    content: ReactNode,
    title?: string,
    fullScreen?: boolean,
    rightIcon?: JSX.Element,
    closeOnBack?: boolean,
    renderBackButton?: boolean,
  ) => void;
  dismissFormModal: () => void;
  formModalVisible: boolean;

  // Loading Modal
  showLoadingModal: (message?: string) => void;
  hideLoadingModal: () => void;
  setLoadingModalState: (
    loading: boolean,
    success: boolean,
    message: string,
    error?: any,
  ) => void;
  loadingModalVisible: boolean;
}

/**
 * Modal Context
 */
const ModalContext = createContext<ModalContextType | undefined>(undefined);

/**
 * Modal Provider Props
 */
interface ModalProviderProps {
  children: ReactNode;
}

/**
 * Modal Provider Component
 *
 * Provides modal functionality to the entire app, replacing HOCs:
 * - withFormModal
 * - withLoadingModal
 * - withStatUpdateModal (partial)
 */
export const ModalProvider: React.FC<ModalProviderProps> = ({ children }) => {
  // Form Modal State
  const [formModal, setFormModal] = useState<FormModalState>({
    visible: false,
    content: null,
    title: '',
    fullScreen: false,
    closeOnBack: true,
    renderBackButton: true,
  });

  // Loading Modal State
  const [loadingModal, setLoadingModal] = useState<LoadingModalState>({
    visible: false,
    loading: false,
    success: false,
    error: null,
    message: '',
  });

  // Form Modal Actions
  const showFormModal = useCallback(
    (
      content: ReactNode,
      title: string = '',
      fullScreen: boolean = false,
      rightIcon?: JSX.Element,
      closeOnBack: boolean = true,
      renderBackButton: boolean = true,
    ) => {
      setFormModal({
        visible: true,
        content,
        title,
        fullScreen,
        rightIcon,
        closeOnBack,
        renderBackButton,
      });
    },
    [],
  );

  const dismissFormModal = useCallback(() => {
    setFormModal(prev => ({ ...prev, visible: false }));
  }, []);

  // Loading Modal Actions
  const showLoadingModal = useCallback((message: string = 'Loading...') => {
    setLoadingModal({
      visible: true,
      loading: true,
      success: false,
      error: null,
      message,
    });
  }, []);

  const hideLoadingModal = useCallback(() => {
    setLoadingModal(prev => ({ ...prev, visible: false }));
  }, []);

  const setLoadingModalState = useCallback(
    (loading: boolean, success: boolean, message: string, error?: any) => {
      setLoadingModal({
        visible: loading || success || !!error,
        loading,
        success,
        error,
        message,
      });
    },
    [],
  );

  // Context Value
  const value: ModalContextType = {
    showFormModal,
    dismissFormModal,
    formModalVisible: formModal.visible,
    showLoadingModal,
    hideLoadingModal,
    setLoadingModalState,
    loadingModalVisible: loadingModal.visible,
  };

  return (
    <ModalContext.Provider value={value}>
      {children}

      {/* Form Modal */}
      <RatsModal
        modalStyle={
          formModal.fullScreen
            ? MODAL_STYLE
            : {
                padding: 0,
                margin: 0,
                alignItems: undefined,
                justifyContent: 'flex-end',
              }
        }
        fullScreen={formModal.fullScreen}
        backdropColor={formModal.fullScreen ? color.white : ''}
        onModalHide={() => {}}
        onModalShow={() => {}}
        onBackButtonPress={formModal.closeOnBack ? dismissFormModal : () => {}}
        style={
          formModal.fullScreen
            ? MODAL_CONTAINER_STYLE
            : { padding: 0, margin: 0, backgroundColor: color.light_grey }
        }
        animationIn="slideInUp"
        animationOut="slideOutDown"
        isVisible={formModal.visible}
        onSwipeComplete={dismissFormModal}
        onBackdropPress={dismissFormModal}>
        {formModal.fullScreen && (
          <View style={{ width: '100%' }}>
            <ScreenHeader
              icon={formModal.rightIcon}
              renderBackButton={formModal.renderBackButton}
              onBackPress={dismissFormModal}
              header={formModal.title}
            />
          </View>
        )}
        {formModal.content}
      </RatsModal>

      {/* Loading Modal */}
      <RatsLoadingModal
        isVisible={loadingModal.visible}
        loading={loadingModal.loading}
        loadingMessage={loadingModal.message}
        success={loadingModal.success}
        error={loadingModal.error}
      />
    </ModalContext.Provider>
  );
};

/**
 * useModal Hook
 *
 * Custom hook to access modal context
 *
 * @example
 * const { showFormModal, dismissFormModal } = useModal();
 * showFormModal(<MyForm />, 'Edit Profile', true);
 */
export const useModal = (): ModalContextType => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};
