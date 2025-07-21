import React from 'react';

const logoUrl = window.location.origin + '/src-tauri/icons/logo.png';

export function DriverExitTicket({ ticket }: { ticket: any }) {
  const printStyles = {
    container: {
      width: '100%',
      maxWidth: '100%',
      padding: '16px',
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      lineHeight: '1.3',
      backgroundColor: '#fff',
      color: '#000',
      border: '2px solid #000',
      margin: '0 auto',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      boxSizing: 'border-box',
      '@media print': {
        boxShadow: 'none',
        border: '2px solid #000',
        margin: '0 auto',
        padding: '16px'
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
      fontSize: '20px',
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
      fontSize: '12px',
      color: '#333',
      marginBottom: '12px'
    },

    divider: {
      border: 'none',
      borderTop: '1px solid #000',
      margin: '8px 0',
      width: '100%'
    },

    bilingualRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      margin: '6px 0',
      fontSize: '14px',
      minHeight: '24px'
    },

    englishLabel: {
      fontWeight: 'bold' as const,
      textTransform: 'uppercase' as const,
      fontSize: '12px',
      textAlign: 'left' as const,
      flex: '0 0 auto',
      minWidth: '80px'
    },

    arabicLabel: {
      fontWeight: 'bold' as const,
      fontSize: '12px',
      textAlign: 'right' as const,
      flex: '0 0 auto',
      minWidth: '100px',
      direction: 'rtl' as const,
      marginRight: '25px'
    },

    centerValue: {
      fontWeight: 'normal' as const,
      textAlign: 'center' as const,
      flex: 1,
      fontSize: '14px',
      margin: '0 12px'
    },

    journeySection: {
      textAlign: 'center' as const,
      margin: '12px 0',
      padding: '8px',
      backgroundColor: '#f8f8f8',
      border: '1px solid #000'
    },

    journeyFlow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      margin: '8px 0'
    },

    station: {
      fontSize: '14px',
      fontWeight: 'bold',
      flex: 1,
      textAlign: 'center' as const
    },

    arrow: {
      fontSize: '18px',
      fontWeight: 'bold',
      margin: '0 12px',
      color: '#000'
    },

    vehicleSection: {
      textAlign: 'center' as const,
      margin: '12px 0',
      padding: '8px',
      backgroundColor: '#f0f0f0',
      border: '1px solid #000'
    },

    vehiclePlate: {
      fontSize: '18px',
      fontWeight: 'bold',
      fontFamily: 'monospace',
      letterSpacing: '1px',
      margin: '8px 0'
    },

    ticketNumber: {
      textAlign: 'center' as const,
      fontSize: '18px',
      fontWeight: 'bold',
      margin: '12px 0',
      padding: '8px',
      border: '2px solid #000',
      borderRadius: '4px',
      backgroundColor: '#f0f0f0'
    },

    footer: {
      textAlign: 'center' as const,
      marginTop: '12px',
      fontSize: '10px',
      fontStyle: 'italic' as const,
      borderTop: '1px solid #000',
      paddingTop: '8px'
    },

    bilingualTitle: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      margin: '6px 0'
    },

    englishTitle: {
      fontSize: '14px',
      fontWeight: 'bold',
      textTransform: 'uppercase' as const
    },

    arabicTitle: {
      fontSize: '14px',
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
          size: A4;
          margin: 10mm;
        }
        body {
          margin: 0 !important;
          padding: 0 !important;
        }
        .driver-exit-ticket {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 auto !important;
          box-shadow: none !important;
          border: 2px solid #000 !important;
          font-size: 12px !important;
          background: white !important;
          color: black !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          box-sizing: border-box !important;
          padding: 16px !important;
        }
        .driver-exit-ticket * {
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

  const { date, time } = formatDateTime(ticket.exitTime || new Date().toISOString());

  return (
    <div className="driver-exit-ticket" style={printStyles.container}>
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

        <h2 style={printStyles.companyName}>NQLIX COMPANY</h2>

        <div style={printStyles.bilingualTitle}>
          <span style={printStyles.englishTitle}>DRIVER EXIT TICKET</span>
          <span style={{...printStyles.arabicTitle, marginRight: '20px'}}>تذكرة خروج السائق</span>
        </div>

        <div style={printStyles.datetime}>
          <div>{date}</div>
          <div>{time}</div>
        </div>
      </div>

      <hr style={printStyles.divider} />

      {/* Journey Information */}
      <div style={printStyles.journeySection}>
        <div style={printStyles.bilingualTitle}>
          <span style={printStyles.englishTitle}>JOURNEY</span>
          <span style={printStyles.arabicTitle}>الرحلة</span>
        </div>
        <div style={printStyles.journeyFlow}>
          <div style={printStyles.station}>
            {ticket.departureStationName}
          </div>
          <div style={printStyles.arrow}>→</div>
          <div style={printStyles.station}>
            {ticket.destinationStationName}
          </div>
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

      <hr style={printStyles.divider} />

      {/* Exit Time */}
      <div style={printStyles.bilingualRow}>
        <span style={printStyles.englishLabel}>EXIT TIME</span>
        <span style={printStyles.centerValue}>{time}</span>
        <span style={printStyles.arabicLabel}>وقت الخروج</span>
      </div>

      <div style={printStyles.bilingualRow}>
        <span style={printStyles.englishLabel}>EXIT DATE</span>
        <span style={printStyles.centerValue}>{date}</span>
        <span style={printStyles.arabicLabel}>تاريخ الخروج</span>
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
          <span>Safe journey!</span>
          <span style={{ direction: 'rtl', marginRight: '20px' }}>رحلة سعيدة!</span>
        </div>
        <div style={printStyles.bilingualTitle}>
          <span>Thank you for your service!</span>
          <span style={{ direction: 'rtl', marginRight: '20px' }}>شكرًا لخدمتك!</span>
        </div>
        <div style={{ marginTop: '4px', fontSize: '8px', textAlign: 'center' }}>
          Printed on {new Date().toLocaleString()} | طُبع في {new Date().toLocaleString()}
        </div>
      </div>
    </div>
  );
} 