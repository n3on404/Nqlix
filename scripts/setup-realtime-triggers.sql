-- PostgreSQL Triggers for Real-time Notifications
-- This file contains triggers that will send NOTIFY events when database changes occur
-- These triggers enable real-time communication between Wasla apps

-- Create a function to send notifications
CREATE OR REPLACE FUNCTION notify_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Send notification based on the table and operation
    IF TG_OP = 'INSERT' THEN
        PERFORM pg_notify(TG_TABLE_NAME || '_events', 
            json_build_object(
                'operation', 'INSERT',
                'table', TG_TABLE_NAME,
                'id', COALESCE(NEW.id::text, 'unknown'),
                'timestamp', NOW()::text,
                'data', row_to_json(NEW)
            )::text
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM pg_notify(TG_TABLE_NAME || '_events', 
            json_build_object(
                'operation', 'UPDATE',
                'table', TG_TABLE_NAME,
                'id', COALESCE(NEW.id::text, 'unknown'),
                'timestamp', NOW()::text,
                'old_data', row_to_json(OLD),
                'new_data', row_to_json(NEW)
            )::text
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM pg_notify(TG_TABLE_NAME || '_events', 
            json_build_object(
                'operation', 'DELETE',
                'table', TG_TABLE_NAME,
                'id', COALESCE(OLD.id::text, 'unknown'),
                'timestamp', NOW()::text,
                'data', row_to_json(OLD)
            )::text
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create a function specifically for booking events
CREATE OR REPLACE FUNCTION notify_booking_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Notify about new booking
        PERFORM pg_notify('booking_events', 
            json_build_object(
                'operation', 'INSERT',
                'table', 'bookings',
                'id', NEW.id::text,
                'destination_id', NEW.destination_id,
                'vehicle_license_plate', NEW.vehicle_license_plate,
                'seats_booked', NEW.seats_booked,
                'total_amount', NEW.total_amount,
                'timestamp', NOW()::text,
                'data', row_to_json(NEW)
            )::text
        );
        
        -- Also notify about queue changes
        PERFORM pg_notify('queue_events', 
            json_build_object(
                'operation', 'BOOKING_CREATED',
                'table', 'vehicle_queue',
                'destination_id', NEW.destination_id,
                'vehicle_license_plate', NEW.vehicle_license_plate,
                'timestamp', NOW()::text
            )::text
        );
        
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM pg_notify('booking_events', 
            json_build_object(
                'operation', 'UPDATE',
                'table', 'bookings',
                'id', NEW.id::text,
                'destination_id', NEW.destination_id,
                'vehicle_license_plate', NEW.vehicle_license_plate,
                'seats_booked', NEW.seats_booked,
                'total_amount', NEW.total_amount,
                'timestamp', NOW()::text,
                'old_data', row_to_json(OLD),
                'new_data', row_to_json(NEW)
            )::text
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM pg_notify('booking_events', 
            json_build_object(
                'operation', 'DELETE',
                'table', 'bookings',
                'id', OLD.id::text,
                'destination_id', OLD.destination_id,
                'vehicle_license_plate', OLD.vehicle_license_plate,
                'seats_booked', OLD.seats_booked,
                'total_amount', OLD.total_amount,
                'timestamp', NOW()::text,
                'data', row_to_json(OLD)
            )::text
        );
        
        -- Also notify about queue changes
        PERFORM pg_notify('queue_events', 
            json_build_object(
                'operation', 'BOOKING_CANCELLED',
                'table', 'vehicle_queue',
                'destination_id', OLD.destination_id,
                'vehicle_license_plate', OLD.vehicle_license_plate,
                'timestamp', NOW()::text
            )::text
        );
        
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create a function specifically for vehicle queue events
CREATE OR REPLACE FUNCTION notify_vehicle_queue_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM pg_notify('vehicle_events', 
            json_build_object(
                'operation', 'VEHICLE_ENTERED',
                'table', 'vehicle_queue',
                'id', NEW.id::text,
                'destination_id', NEW.destination_id,
                'destination_name', NEW.destination_name,
                'license_plate', NEW.license_plate,
                'queue_position', NEW.queue_position,
                'status', NEW.status,
                'available_seats', NEW.available_seats,
                'total_seats', NEW.total_seats,
                'timestamp', NOW()::text,
                'data', row_to_json(NEW)
            )::text
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM pg_notify('vehicle_events', 
            json_build_object(
                'operation', 'VEHICLE_UPDATED',
                'table', 'vehicle_queue',
                'id', NEW.id::text,
                'destination_id', NEW.destination_id,
                'destination_name', NEW.destination_name,
                'license_plate', NEW.license_plate,
                'queue_position', NEW.queue_position,
                'status', NEW.status,
                'available_seats', NEW.available_seats,
                'total_seats', NEW.total_seats,
                'timestamp', NOW()::text,
                'old_data', row_to_json(OLD),
                'new_data', row_to_json(NEW)
            )::text
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM pg_notify('vehicle_events', 
            json_build_object(
                'operation', 'VEHICLE_EXITED',
                'table', 'vehicle_queue',
                'id', OLD.id::text,
                'destination_id', OLD.destination_id,
                'destination_name', OLD.destination_name,
                'license_plate', OLD.license_plate,
                'queue_position', OLD.queue_position,
                'status', OLD.status,
                'available_seats', OLD.available_seats,
                'total_seats', OLD.total_seats,
                'timestamp', NOW()::text,
                'data', row_to_json(OLD)
            )::text
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS bookings_notify_trigger ON bookings;
DROP TRIGGER IF EXISTS vehicle_queue_notify_trigger ON vehicle_queue;
DROP TRIGGER IF EXISTS day_passes_notify_trigger ON day_passes;
DROP TRIGGER IF EXISTS exit_passes_notify_trigger ON exit_passes;

-- Create triggers for bookings table
CREATE TRIGGER bookings_notify_trigger
    AFTER INSERT OR UPDATE OR DELETE ON bookings
    FOR EACH ROW EXECUTE FUNCTION notify_booking_change();

-- Create triggers for vehicle_queue table
CREATE TRIGGER vehicle_queue_notify_trigger
    AFTER INSERT OR UPDATE OR DELETE ON vehicle_queue
    FOR EACH ROW EXECUTE FUNCTION notify_vehicle_queue_change();

-- Create triggers for day_passes table
CREATE TRIGGER day_passes_notify_trigger
    AFTER INSERT OR UPDATE OR DELETE ON day_passes
    FOR EACH ROW EXECUTE FUNCTION notify_change();

-- Create triggers for exit_passes table
CREATE TRIGGER exit_passes_notify_trigger
    AFTER INSERT OR UPDATE OR DELETE ON exit_passes
    FOR EACH ROW EXECUTE FUNCTION notify_change();

-- Create a function to test notifications
CREATE OR REPLACE FUNCTION test_notifications()
RETURNS void AS $$
BEGIN
    -- Test booking notification
    PERFORM pg_notify('booking_events', 
        json_build_object(
            'operation', 'TEST',
            'table', 'bookings',
            'id', 'test-123',
            'destination_id', 'test-dest',
            'vehicle_license_plate', 'TEST123',
            'seats_booked', 2,
            'total_amount', 10.0,
            'timestamp', NOW()::text,
            'data', json_build_object('test', true)
        )::text
    );
    
    -- Test queue notification
    PERFORM pg_notify('queue_events', 
        json_build_object(
            'operation', 'TEST',
            'table', 'vehicle_queue',
            'destination_id', 'test-dest',
            'vehicle_license_plate', 'TEST123',
            'timestamp', NOW()::text
        )::text
    );
    
    -- Test vehicle notification
    PERFORM pg_notify('vehicle_events', 
        json_build_object(
            'operation', 'TEST',
            'table', 'vehicle_queue',
            'id', 'test-queue-123',
            'destination_id', 'test-dest',
            'destination_name', 'Test Destination',
            'license_plate', 'TEST123',
            'queue_position', 1,
            'status', 'WAITING',
            'available_seats', 6,
            'total_seats', 8,
            'timestamp', NOW()::text,
            'data', json_build_object('test', true)
        )::text
    );
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION notify_change() TO PUBLIC;
GRANT EXECUTE ON FUNCTION notify_booking_change() TO PUBLIC;
GRANT EXECUTE ON FUNCTION notify_vehicle_queue_change() TO PUBLIC;
GRANT EXECUTE ON FUNCTION test_notifications() TO PUBLIC;

-- Create indexes for better performance on notification queries
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at);
CREATE INDEX IF NOT EXISTS idx_bookings_destination_id ON bookings(destination_id);
CREATE INDEX IF NOT EXISTS idx_bookings_vehicle_license_plate ON bookings(vehicle_license_plate);
CREATE INDEX IF NOT EXISTS idx_vehicle_queue_updated_at ON vehicle_queue(updated_at);
CREATE INDEX IF NOT EXISTS idx_vehicle_queue_destination_id ON vehicle_queue(destination_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_queue_license_plate ON vehicle_queue(license_plate);

-- Add comments for documentation
COMMENT ON FUNCTION notify_change() IS 'Generic function to send notifications for any table changes';
COMMENT ON FUNCTION notify_booking_change() IS 'Specialized function to send notifications for booking changes with additional context';
COMMENT ON FUNCTION notify_vehicle_queue_change() IS 'Specialized function to send notifications for vehicle queue changes';
COMMENT ON FUNCTION test_notifications() IS 'Test function to verify notification system is working';

COMMENT ON TRIGGER bookings_notify_trigger ON bookings IS 'Triggers notifications when bookings are created, updated, or deleted';
COMMENT ON TRIGGER vehicle_queue_notify_trigger ON vehicle_queue IS 'Triggers notifications when vehicles enter, update, or exit the queue';
COMMENT ON TRIGGER day_passes_notify_trigger ON day_passes IS 'Triggers notifications when day passes are created, updated, or deleted';
COMMENT ON TRIGGER exit_passes_notify_trigger ON exit_passes IS 'Triggers notifications when exit passes are created, updated, or deleted';