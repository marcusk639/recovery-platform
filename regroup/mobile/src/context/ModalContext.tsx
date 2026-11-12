import React, {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useState,
  ReactNode,
} from 'react';
import { View } from 'react-native';
import RatsModalBase from '../components/rats-modal';
const RatsModal = RatsModalBase as any;
import RatsLoadingModal from '../components/rats-loading-modal';
import ScreenHeader from '../components/screen-header';
import { color, MODAL_STYLE, MODAL_CONTAINER_STYLE } from '../styles/theme';
import { IOS } from '../util/platform';
import { useLoadingModalAutoHide } from './useLoadingModalAutoHide';

/**
 * Modal Context Types
 */
interface FormModalState {
  visible: boolean;
  content: ReactNode;
  title: string;
  fullScreen: boolean;
  rightIcon?: React.JSX.Element;
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
    rightIcon?: React.JSX.Element,
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
 * Which host renders the modals, for ScreenModalHost below.
 */
interface ModalHostContextType {
  activeScreenHost: string | undefined;
  addScreenHost: (id: string) => void;
  removeScreenHost: (id: string) => void;
  modals: ReactNode;
}

const ModalHostContext = createContext<ModalHostContextType | undefined>(undefined);

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

  // Modal-group screens up right now, oldest first. The last one is on top.
  const [screenHosts, setScreenHosts] = useState<string[]>([]);
  const activeScreenHost = screenHosts[screenHosts.length - 1];

  const addScreenHost = useCallback((id: string) => {
    setScreenHosts(prev => [...prev, id]);
  }, []);

  const removeScreenHost = useCallback((id: string) => {
    setScreenHosts(prev => prev.filter(host => host !== id));
  }, []);

  // Form Modal Actions
  const showFormModal = useCallback(
    (
      content: ReactNode,
      title: string = '',
      fullScreen: boolean = false,
      rightIcon?: React.JSX.Element,
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

  useLoadingModalAutoHide(loadingModal.loading, loadingModal.visible, hideLoadingModal);

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

  const modals = (
    <>
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
    </>
  );

  return (
    <ModalContext.Provider value={value}>
      <ModalHostContext.Provider
        value={{ activeScreenHost, addScreenHost, removeScreenHost, modals }}>
        {children}
        {activeScreenHost === undefined && modals}
      </ModalHostContext.Provider>
    </ModalContext.Provider>
  );
};

/**
 * Hosts the app's modals inside a modal-group screen, on iOS.
 *
 * The app root presents these screens as sheets, and UIKit won't present from a
 * view controller that is already presenting. A modal hosted at the root then
 * never appears ("Attempt to present ... on RCTRootViewController"). Hosted here,
 * React Native presents it from the sheet. The top sheet hosts; Android has no
 * such limit, so it stays at the root.
 */
export const ScreenModalHost = () => {
  const id = useId();
  const hosts = useContext(ModalHostContext);
  const addScreenHost = hosts?.addScreenHost;
  const removeScreenHost = hosts?.removeScreenHost;

  useLayoutEffect(() => {
    if (!IOS || !addScreenHost || !removeScreenHost) {
      return;
    }
    addScreenHost(id);
    return () => removeScreenHost(id);
  }, [id, addScreenHost, removeScreenHost]);

  return hosts?.activeScreenHost === id ? <>{hosts.modals}</> : null;
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
