import "@/styles/globals.css";
import { Provider } from 'react-redux';
import { store } from '../store';
<<<<<<< HEAD
import "../styles/globals.css";
=======
>>>>>>> 9520038087bdf8bd59e0db750d4d32857fe2449e

export default function App({ Component, pageProps }) {
  return (
    <Provider store={store}>
      <Component {...pageProps} />
    </Provider>
  );
}
