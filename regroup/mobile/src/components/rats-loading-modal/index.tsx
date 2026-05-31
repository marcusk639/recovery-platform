import React, { Component } from 'react';
import { StyleSheet, View } from 'react-native';
import Modal from 'react-native-modal';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import RatsLoadingIndicator from '../rats-loading-indicator/rats-loading-indicator';
import { RatsText } from '../rats-text';
import { color, windowHeight, normalize, fontSize } from '../../styles/theme';
import { withRats } from '../rats-hoc';

const styles = StyleSheet.create({
  modalContent: {
    height: windowHeight / 3,
    backgroundColor: 'white',
    padding: normalize(15),
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: normalize(4),
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  activityIndicatorWrapper: {
    backgroundColor: '#FFFFFF',
    flex: 1,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingMessage: {
    alignItems: 'center',
  },
  successMessage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIconView: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  successIconStyle: {
    color: color.green,
  },
  failureIconStyle: {
    color: color.red,
  },
  successText: {
    fontSize: fontSize.large,
    // paddingLeft: normalize(5),
    alignSelf: 'center',
  },
  loadingMessageText: {
    fontSize: fontSize.large,
  },
  successView: {
    justifyContent: 'center',
  },
});

interface Props {
  isVisible: boolean;
  onBackdropPress?: () => any;
  loading: boolean;
  loadingMessage: string;
  success: boolean;
  error: string;
  errorTemplate?: () => JSX.Element | JSX.Element[];
}

interface State {
  isVisible: boolean;
}

class RatsLoadingModal extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    const { isVisible } = this.props;
    this.state = {
      isVisible,
    };
  }

  UNSAFE_componentWillReceiveProps(nextProps: Props) {
    const { isVisible } = this.props;
    if (!isVisible && nextProps.isVisible) {
      this.setState({ isVisible: true });
    }
  }

  componentDidUpdate(prevProps: Props) {
    const { loading } = this.props;
    if (!loading && prevProps.loading) {
      const timeout = new Promise(resolve => setTimeout(resolve, 1000));
      timeout.then(() => this.setState({ isVisible: false }));
    }
  }

  renderSuccess() {
    return (
      <View style={styles.successView}>
        <View style={styles.successMessage}>
          <RatsText style={styles.successText} text="success" />
        </View>
        <View style={styles.successIconView}>
          <FontAwesome5
            name="check-circle"
            size={normalize(75)}
            style={styles.successIconStyle}
          />
        </View>
      </View>
    );
  }

  renderError() {
    return (
      <View style={styles.successView}>
        <View style={styles.successMessage}>
          <RatsText
            style={styles.successText}
            text={this.props.error || 'failure'}
          />
        </View>
        <View style={styles.successIconView}>
          <FontAwesome5
            name="times-circle"
            size={normalize(75)}
            style={styles.failureIconStyle}
          />
        </View>
        {this.props.errorTemplate && this.props.errorTemplate()}
      </View>
    );
  }

  render() {
    const { loadingMessage, loading, error } = this.props;
    const { isVisible } = this.state;
    // const [visible, setVisible] = useState(isVisible);
    return (
      <Modal animationIn="zoomIn" animationOut="zoomOut" isVisible={isVisible}>
        <View style={styles.modalContent}>
          <View style={styles.activityIndicatorWrapper}>
            {loading && !error && (
              <View>
                <View style={styles.loadingMessage}>
                  <RatsText
                    style={styles.loadingMessageText}
                    text={loadingMessage}
                  />
                </View>
                <RatsLoadingIndicator />
              </View>
            )}
            {!loading && !error && this.renderSuccess()}
            {!loading && error && this.renderError()}
          </View>
        </View>
      </Modal>
    );
  }
}

export default withRats(RatsLoadingModal);
