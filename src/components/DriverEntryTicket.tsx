import React from 'react';

const logoUrl = window.location.origin + '/src-tauri/icons/logo.png';

export function DriverEntryTicket({ ticket }: { ticket: any }) {
  const printStyles = {
    container: {
      width: '80mm',
      padding: '12px 16px',
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      lineHeight: '1.3',
      backgroundColor: '#fff',
      color: '#000',
      border: '1px solid #000',
      margin: '0 auto',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      '@media print': {
        boxShadow: 'none',
        border: 'none',
        margin: '0 4mm',
        padding: '8px 12px'
      }
    } as React.CSSProperties,

    header: {
      textAlign: 'center' as const,
      borderBottom: '2px solid #000',
      paddingBottom: '8px',
      marginBottom: '8px'
    },

    logo: {
      width: '60px',
      height: 'auto',
      margin: '0 auto 4px',
      display: 'block'
    } as React.CSSProperties,

    companyName: {
      textAlign: 'center' as const,
      margin: '0 0 4px 0',
      fontSize: '16px',
      fontWeight: 'bold',
      textTransform: 'uppercase' as const,
      letterSpacing: '1px'
    },

    ticketTitle: {
      textAlign: 'center' as const,
      fontSize: '14px',
      fontWeight: 'bold',
      margin: '4px 0',
      textTransform: 'uppercase' as const
    },

    datetime: {
      textAlign: 'center' as const,
      fontSize: '10px',
      color: '#333',
      marginBottom: '8px'
    },

    divider: {
      border: 'none',
      borderTop: '1px solid #000',
      margin: '4px 0',
      width: '100%'
    },

    bilingualRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      margin: '4px 0',
      fontSize: '11px',
      minHeight: '18px'
    },

    englishLabel: {
      fontWeight: 'bold' as const,
      textTransform: 'uppercase' as const,
      fontSize: '10px',
      textAlign: 'left' as const,
      flex: '0 0 auto',
      minWidth: '55px'
    },

    arabicLabel: {
      fontWeight: 'bold' as const,
      fontSize: '10px',
      textAlign: 'right' as const,
      flex: '0 0 auto',
      minWidth: '75px',
      direction: 'rtl' as const,
      marginRight: '25px'
    },

    centerValue: {
      fontWeight: 'normal' as const,
      textAlign: 'center' as const,
      flex: 1,
      fontSize: '11px',
      margin: '0 8px'
    },

    stationSection: {
      textAlign: 'center' as const,
      margin: '6px 0',
      padding: '4px',
      backgroundColor: '#f8f8f8',
      border: '1px solid #000'
    },

    vehicleSection: {
      textAlign: 'center' as const,
      margin: '6px 0',
      padding: '4px',
      backgroundColor: '#f0f0f0',
      border: '1px solid #000'
    },

    vehiclePlate: {
      fontSize: '14px',
      fontWeight: 'bold',
      fontFamily: 'monospace',
      letterSpacing: '1px',
      margin: '4px 0'
    },

    ticketNumber: {
      textAlign: 'center' as const,
      fontSize: '14px',
      fontWeight: 'bold',
      margin: '6px 0',
      padding: '4px',
      border: '2px solid #000',
      borderRadius: '2px',
      backgroundColor: '#f0f0f0'
    },

    priceSection: {
      textAlign: 'center' as const,
      margin: '4px 0',
      padding: '4px',
      backgroundColor: '#f8f8f8',
      border: '1px solid #ccc'
    },

    totalPrice: {
      fontSize: '14px',
      fontWeight: 'bold',
      color: '#000'
    },

    queueSection: {
      textAlign: 'center' as const,
      margin: '6px 0',
      padding: '4px',
      backgroundColor: '#e8f4f8',
      border: '1px solid #ccc'
    },

    footer: {
      textAlign: 'center' as const,
      marginTop: '6px',
      fontSize: '8px',
      fontStyle: 'italic' as const,
      borderTop: '1px solid #000',
      paddingTop: '4px'
    },

    bilingualTitle: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      margin: '4px 0'
    },

    englishTitle: {
      fontSize: '10px',
      fontWeight: 'bold',
      textTransform: 'uppercase' as const
    },

    arabicTitle: {
      fontSize: '10px',
      fontWeight: 'bold',
      direction: 'rtl' as const,
      paddingRight: '12px'
    }
  };

  // Add print-specific styles
  React.useEffect(() => {
    const printStyles = `
      @media print {
        @page {
          size: 80mm auto;
          margin: 0;
        }
        body {
          margin: 0 !important;
          padding: 0 !important;
        }
        .driver-entry-ticket {
          display: block !important;
          width: 80mm !important;
          margin: 0 auto !important;
          box-shadow: none !important;
          border: 1px solid #000 !important;
          font-size: 10px !important;
          background: white !important;
          color: black !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        .driver-entry-ticket * {
          visibility: visible !important;
          color: black !important;
        }
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.innerText = printStyles;
    document.head.appendChild(styleSheet);

    return () => {
      document.head.removeChild(styleSheet);
    };
  }, []);

  const formatDateTime = (dateTime: string) => {
    const date = new Date(dateTime);
    return {
      date: date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      time: date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      })
    };
  };

  const { date, time } = formatDateTime(ticket.entryTime || new Date().toISOString());

  return (
    <div className="driver-entry-ticket" style={printStyles.container}>
      {/* Header */}
      <div style={printStyles.header}>
        <img
          src={logoUrl}
          alt="Company Logo"
          style={printStyles.logo}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />

        <h2 style={printStyles.companyName}>WASLA TRANSPORTATION</h2>

        <div style={printStyles.bilingualTitle}>
          <span style={printStyles.englishTitle}>DRIVER ENTRY TICKET</span>
          <span style={{...printStyles.arabicTitle, marginRight: '20px'}}>تذكرة دخول السائق</span>
        </div>

        <div style={printStyles.datetime}>
          <div>{date}</div>
          <div>{time}</div>
        </div>
      </div>

      <hr style={printStyles.divider} />

      {/* Station Information */}
      <div style={printStyles.stationSection}>
        <div style={printStyles.bilingualTitle}>
          <span style={printStyles.englishTitle}>STATION</span>
          <span style={printStyles.arabicTitle}>المحطة</span>
        </div>
        <div style={{ fontSize: '12px', fontWeight: 'bold', margin: '4px 0' }}>
          {ticket.stationName}
        </div>
      </div>

      {/* Vehicle Information */}
      <div style={printStyles.vehicleSection}>
        <div style={printStyles.bilingualTitle}>
          <span style={printStyles.englishTitle}>VEHICLE</span>
          <span style={printStyles.arabicTitle}>المركبة</span>
        </div>
        <div style={printStyles.vehiclePlate}>
          {ticket.licensePlate}
        </div>
      </div>

      {/* Queue Information */}
      <div style={printStyles.queueSection}>
        <div style={printStyles.bilingualTitle}>
          <span style={printStyles.englishTitle}>QUEUE POSITION</span>
          <span style={printStyles.arabicTitle}>موقع في الطابور</span>
        </div>
        <div style={{ fontSize: '16px', fontWeight: 'bold', margin: '4px 0', textAlign: 'center' }}>
          #{ticket.queuePosition}
        </div>
        {ticket.nextVehiclePlate && (
          <>
            <div style={printStyles.bilingualTitle}>
              <span style={printStyles.englishTitle}>NEXT VEHICLE</span>
              <span style={printStyles.arabicTitle}>المركبة التالية</span>
            </div>
            <div style={{ 
              fontSize: '14px', 
              fontWeight: 'bold', 
              margin: '4px 0', 
              textAlign: 'center',
              fontFamily: 'monospace',
              letterSpacing: '1px',
              padding: '4px',
              backgroundColor: '#f0f0f0',
              border: '1px solid #000',
              borderRadius: '2px'
            }}>
              {ticket.nextVehiclePlate}
            </div>
          </>
        )}
      </div>

      <hr style={printStyles.divider} />

      {/* Price Section */}
      <div style={printStyles.priceSection}>
        <div style={printStyles.bilingualRow}>
          <span style={printStyles.englishLabel}>ENTRY FEE</span>
          <span style={{ ...printStyles.centerValue, fontWeight: 'bold', fontSize: '12px' }}>
            {ticket.ticketPrice || 2.0} TND
          </span>
          <span style={printStyles.arabicLabel}>رسوم الدخول</span>
        </div>
      </div>

      <hr style={printStyles.divider} />

      {/* Ticket Number */}
      <div style={printStyles.ticketNumber}>
        <div style={printStyles.bilingualTitle}>
          <span style={printStyles.englishTitle}>TICKET</span>
          <span style={printStyles.arabicTitle}>التذكرة</span>
        </div>
        #{ticket.ticketNumber}
      </div>

      <hr style={printStyles.divider} />

      {/* Footer */}
      <div style={printStyles.footer}>
        <div style={printStyles.bilingualTitle}>
          <span>Keep this ticket for your records</span>
          <span style={{ direction: 'rtl', marginRight: '20px' }}>احتفظ بهذه التذكرة لسجلاتك</span>
        </div>
        <div style={printStyles.bilingualTitle}>
          <span>Entry fee: 2 TND</span>
          <span style={{ direction: 'rtl', marginRight: '20px' }}>رسوم الدخول: 2 دينار</span>
        </div>
        <div style={{ marginTop: '2px', fontSize: '7px', textAlign: 'center' }}>
          Printed on {new Date().toLocaleString()} | طُبع في {new Date().toLocaleString()}
        </div>
      </div>
    </div>
  );
} 