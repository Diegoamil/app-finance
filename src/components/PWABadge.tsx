import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const PWABadge: React.FC = () => {
  const {
    offlineReady,
    needUpdate,
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ', r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  const [isOfflineReady, setOfflineReady] = Array.isArray(offlineReady) ? offlineReady : [false, () => {}];
  const [isNeedUpdate, setNeedUpdate] = Array.isArray(needUpdate) ? needUpdate : [false, () => {}];


  const close = () => {
    setOfflineReady(false);
    setNeedUpdate(false);
  };

  if (!isOfflineReady && !isNeedUpdate) return null;

  return (
    <div className="fixed bottom-20 right-4 z-[9999] p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-500">
      <div className="flex flex-col gap-3">
        <div className="text-slate-200 text-sm font-medium">
          {isOfflineReady ? (
            <span>App pronto para uso offline!</span>
          ) : (
            <span>Nova versão disponível. Atualizar?</span>
          )}
        </div>
        <div className="flex gap-2">
          {isNeedUpdate && (
            <button
              onClick={() => updateServiceWorker(true)}
              className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-500 transition-colors"
            >
              Atualizar
            </button>
          )}
          <button
            onClick={() => close()}
            className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-lg hover:bg-slate-700 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default PWABadge;
