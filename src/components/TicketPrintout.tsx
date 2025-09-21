import React from 'react';

const logoUrl = window.location.origin + '/src-tauri/icons/logo.png';

export function TicketPrintout({ booking }: { booking: any }) {
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
      marginBottom: '8px'
    },

    divider: {
      border: 'none',
      borderTop: '1px solid #000',
      margin: '6px 0',
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

    journeySection: {
      textAlign: 'center' as const,
      margin: '8px 0',
      padding: '6px',
      border: '1px solid #000'
    },

    journeyFlow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      margin: '4px 0'
    },

    station: {
      fontSize: '12px',
      fontWeight: 'bold',
      flex: 1,
      textAlign: 'center' as const
    },

    arrow: {
      fontSize: '16px',
      fontWeight: 'bold',
      margin: '0 8px',
      color: '#000'
    },

    vehicleSection: {
      textAlign: 'center' as const,
      margin: '8px 0',
      padding: '6px',
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
      margin: '8px 0',
      padding: '6px',
      border: '2px solid #000',
      borderRadius: '2px'
    },

    qrSection: {
      textAlign: 'center' as const,
      margin: '8px 0'
    },

    qrPlaceholder: {
      width: '50px',
      height: '50px',
      margin: '4px auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '8px',
      border: '1px solid #000',
      fontFamily: 'monospace'
    },

    footer: {
      textAlign: 'center' as const,
      marginTop: '8px',
      fontSize: '9px',
      fontStyle: 'italic' as const,
      borderTop: '1px solid #000',
      paddingTop: '6px'
    },

    priceSection: {
      textAlign: 'center' as const,
      margin: '6px 0',
      padding: '4px',
      border: '1px solid #000'
    },

    totalPrice: {
      fontSize: '14px',
      fontWeight: 'bold',
      color: '#000'
    },

    verificationCode: {
      textAlign: 'center' as const,
      fontSize: '10px',
      fontFamily: 'monospace',
      margin: '4px 0',
      padding: '2px',
      border: '1px solid #000'
    },

    passengerSection: {
      textAlign: 'center' as const,
      margin: '6px 0',
      padding: '4px',
      border: '1px solid #000'
    },

    passengerName: {
      fontSize: '12px',
      fontWeight: 'bold',
      margin: '2px 0'
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
          margin: 2mm;
        }
        body * {
          visibility: hidden;
        }
        .ticket-printout, .ticket-printout * {
          visibility: visible;
        }
        .ticket-printout {
          position: absolute;
          left: 0;
          top: 0;
          width: 100% !important;
          box-shadow: none !important;
          border: none !important;
          font-size: 10px !important;
        }
        .ticket-printout * {
          font-size: inherit !important;
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

  const { date, time } = formatDateTime(booking.bookingTime || booking.createdAt || new Date().toISOString());

  return (
    <div className="ticket-printout" style={printStyles.container}>
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
          <span style={printStyles.englishTitle}>PASSENGER TICKET</span>
          <span style={{...printStyles.arabicTitle, marginRight: '20px'}}>تذكرة راكب</span>
        </div>

        <div style={printStyles.datetime}>
          <div>{date}</div>
          <div>{time}</div>
        </div>
      </div>

      <hr style={printStyles.divider} />

      {/* Passenger Information */}
      {booking.customerName && (
        <div style={printStyles.passengerSection}>
          <div style={printStyles.bilingualTitle}>
            <span style={printStyles.englishTitle}>PASSENGER</span>
            <span style={printStyles.arabicTitle}>الراكب</span>
          </div>
          <div style={printStyles.passengerName}>{booking.customerName}</div>
        </div>
      )}

      {/* Journey Flow */}
      <div style={printStyles.journeySection}>
        <div style={printStyles.bilingualTitle}>
          <span style={printStyles.englishTitle}>JOURNEY</span>
          <span style={printStyles.arabicTitle}>الرحلة</span>
        </div>
        <div style={printStyles.journeyFlow}>
          <div style={printStyles.station}>
            {booking.startStationName || 'CURRENT STATION'}
          </div>
          <div style={printStyles.arrow}>→</div>
          <div style={printStyles.station}>
            {booking.destinationName}
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
          {booking.vehicleLicensePlate}
        </div>
      </div>

      {/* Journey Details */}
      <div style={printStyles.bilingualRow}>
        <span style={printStyles.englishLabel}>SEATS</span>
        <span style={printStyles.centerValue}>{booking.seatsBooked || booking.seats || 1}</span>
        <span style={printStyles.arabicLabel}>المقاعد</span>
      </div>

      {booking.seatNumber && (
        <div style={printStyles.bilingualRow}>
          <span style={printStyles.englishLabel}>SEAT NO</span>
          <span style={printStyles.centerValue}>{booking.seatNumber}</span>
          <span style={printStyles.arabicLabel}>رقم المقعد</span>
        </div>
      )}

      <hr style={printStyles.divider} />

      {/* Price Breakdown Section */}
      <div style={printStyles.priceSection}>
        {/* Base Price */}
        <div style={printStyles.bilingualRow}>
          <span style={printStyles.englishLabel}>BASE PRICE</span>
          <span style={printStyles.centerValue}>
            {(booking.baseAmount || (booking.pricePerSeat * (booking.seatsBooked || 1)) || 0).toFixed(2)} TND
          </span>
          <span style={printStyles.arabicLabel}>السعر الأساسي</span>
        </div>
        
        {/* Service Fee */}
        <div style={printStyles.bilingualRow}>
          <span style={printStyles.englishLabel}>SERVICE FEE</span>
          <span style={printStyles.centerValue}>
            {(booking.serviceFeeAmount || 0).toFixed(2)} TND
          </span>
          <span style={printStyles.arabicLabel}>رسوم الخدمة</span>
        </div>
        
        {/* Total */}
        <div style={printStyles.bilingualRow}>
          <span style={printStyles.englishLabel}>TOTAL</span>
          <span style={{ ...printStyles.centerValue, fontWeight: 'bold', fontSize: '12px' }}>
            {(booking.totalAmount || (booking.baseAmount + booking.serviceFeeAmount) || 0).toFixed(2)} TND
          </span>
          <span style={printStyles.arabicLabel}>المجموع</span>
        </div>
      </div>

      <hr style={printStyles.divider} />

      {/* Ticket Number */}
      <div style={printStyles.ticketNumber}>
        <div style={printStyles.bilingualTitle}>
          <span style={printStyles.englishTitle}>TICKET</span>
          <span style={printStyles.arabicTitle}>التذكرة</span>
        </div>
        #{booking.ticketId || booking.verificationCode || booking.id}
      </div>

      {/* Verification Code */}
      {booking.verificationCode && (
        <div style={printStyles.verificationCode}>
          <div style={printStyles.bilingualRow}>
            <span style={printStyles.englishLabel}>CODE</span>
            <span style={printStyles.centerValue}>{booking.verificationCode}</span>
            <span style={printStyles.arabicLabel}>الرمز</span>
          </div>
        </div>
      )}

      {/* QR Code Placeholder */}
      <div style={printStyles.qrSection}>
        <div style={printStyles.qrPlaceholder}>
          QR CODE
        </div>
        <div style={{ fontSize: '8px' }}>
          <div style={printStyles.bilingualTitle}>
            <span>Scan for verification</span>
            <span style={{ direction: 'rtl', paddingRight: '12px' }}>امسح للتحقق</span>
          </div>
        </div>
      </div>

      <hr style={printStyles.divider} />

      {/* Footer */}
      <div style={printStyles.footer}>
        <div style={printStyles.bilingualTitle}>
          <span>Keep this ticket for your journey</span>
          <span style={{ direction: 'rtl', marginRight: '20px' }}>احتفظ بهذه التذكرة لرحلتك</span>
        </div>
        <div style={printStyles.bilingualTitle}>
          <span>Valid for one trip only</span>
          <span style={{ direction: 'rtl', marginRight: '20px' }}>صالحة لرحلة واحدة فقط</span>
        </div>
        <div style={printStyles.bilingualTitle}>
          <span>Thank you for traveling with us!</span>
          <span style={{ direction: 'rtl', marginRight: '20px' }}>شكرًا لسفرك معنا!</span>
        </div>
        <div style={{ marginTop: '4px', fontSize: '8px', textAlign: 'center' }}>
          Printed on {new Date().toLocaleString()} | طُبع في {new Date().toLocaleString()}
        </div>
      </div>
    </div>
  );
}