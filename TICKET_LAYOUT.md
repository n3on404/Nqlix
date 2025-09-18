# STE Dhraiff Services Transport - Ticket Layout

## Updated Ticket Format with Centered Logo

```
                    [STE LOGO]
                    (Centered at top)

========================================
        STE Dhraiff Services Transport
========================================

N° Ticket: STE-001
Passager: Ahmed Ben Ali
Trajet: Tunis - Sfax
Départ: 14:30
Siège: A12
Prix: 25.500 TND

Merci de votre confiance!

========================================
Date: 16/09/2025 14:30:25
Merci de votre confiance!
========================================
```

## Key Changes Made

✅ **Logo Positioning**: Logo is now centered at the very top of the ticket
✅ **Alignment**: `printer.alignCenter()` is called before printing the logo
✅ **Consistent Format**: All printing functions now center the logo
✅ **Professional Look**: Clean, centered logo presentation

## Updated Functions

1. **`print_standard_ticket()`** - Logo centered at top
2. **`print_with_logo()`** - Logo centered at top
3. **Test Scripts** - Updated to show centered logo
4. **Example Scripts** - All examples now center the logo

## Testing

- ✅ Standard ticket test passed
- ✅ Logo prints successfully in center
- ✅ All compilation checks pass
- ✅ Printer connection working

The logo is now perfectly centered at the top of every STE Dhraiff Services Transport ticket!