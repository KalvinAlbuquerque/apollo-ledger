// src/utils/toastUtils.js

import React from 'react';
import toast from 'react-hot-toast';

export const showConfirmationToast = (onConfirm, message = "Você tem certeza?") => {
  toast(
    (t) => (
      <div className="confirmationToast">
        <span>{message}</span>
        <div className="toastButtons">
          <button
            className="confirmButton"
            onClick={() => {
              onConfirm();
              toast.dismiss(t.id);
            }}
          >
            Confirmar
          </button>
          <button className="cancelButton" onClick={() => toast.dismiss(t.id)}>
            Cancelar
          </button>
        </div>
      </div>
    ),
    {
      duration: Infinity,
    }
  );
};