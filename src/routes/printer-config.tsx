import React from 'react';
import { PrinterConfigComponent } from '../components/PrinterConfig';

export const PrinterConfigPage: React.FC = () => {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Configuration Imprimante</h1>
        <p className="text-muted-foreground mt-2">
          Configurez et testez votre imprimante thermique Epson TM-T20X
        </p>
      </div>
        <PrinterConfigComponent />
    </div>
  );
};