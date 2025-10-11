// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::net::IpAddr;
use std::time::Duration;
use tokio::time::timeout;
use reqwest::Client;
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;
use tauri::{
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem,
    WindowEvent, GlobalShortcutManager, WindowBuilder, WindowUrl
};
use auto_launch::AutoLaunchBuilder;
use deadpool_postgres::{Pool, Runtime};
use tokio_postgres::{NoTls, Row};
use dotenvy::dotenv;
use std::env as stdenv;
use crate::printer::StaffInfo;
use chrono::TimeZone;

mod printer;
mod realtime;
use printer::{PrinterService, PrinterConfig, PrintJob, PrinterStatus};
use realtime::{start_realtime_listening, stop_realtime_listening, get_realtime_status};

// WebSocket relay removed

// Printer service state
static PRINTER_SERVICE: Lazy<Arc<Mutex<PrinterService>>> = Lazy::new(|| Arc::new(Mutex::new(PrinterService::new())));

// ===================== DATABASE POOL =====================
static DB_POOL: Lazy<Pool> = Lazy::new(|| {
    // load .env if exists
    let _ = dotenv();
    let db_url = stdenv::var("DATABASE_URL").unwrap_or_else(|_|
        "postgresql://ivan:Lost2409@127.0.0.1:5432/louaj_node".to_string()
    );

    let mut cfg = deadpool_postgres::Config::new();
    cfg.url = Some(db_url);
    cfg.pool = Some(deadpool_postgres::PoolConfig::new(16));
    cfg.create_pool(Some(Runtime::Tokio1), NoTls).expect("Failed to create DB pool")
});

#[derive(Debug, Serialize, Deserialize)]
struct QueueSummaryDto {
    destinationId: String,
    destinationName: String,
    totalVehicles: i64,
    waitingVehicles: i64,
    loadingVehicles: i64,
    readyVehicles: i64,
    governorate: Option<String>,
    delegation: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct QueueItemDto {
    id: String,
    destinationId: String,
    destinationName: String,
    queuePosition: i32,
    status: String,
    availableSeats: i32,
    totalSeats: i32,
    basePrice: f64,
    licensePlate: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct AuthorizedDestinationDto {
    stationId: String,
    stationName: String,
    basePrice: f64,
    isDefault: bool,
    priority: i32,
}

async fn map_queue_row(row: &Row) -> QueueItemDto {
    QueueItemDto {
        id: row.get::<_, String>("id"),
        destinationId: row.get::<_, String>("destination_id"),
        destinationName: row.get::<_, String>("destination_name"),
        queuePosition: row.get::<_, i32>("queue_position"),
        status: row.get::<_, String>("status"),
        availableSeats: row.get::<_, i32>("available_seats"),
        totalSeats: row.get::<_, i32>("total_seats"),
        basePrice: row.get::<_, f64>("base_price"),
        licensePlate: row.get::<_, String>("license_plate"),
    }
}

#[tauri::command]
async fn db_get_queue_summaries() -> Result<Vec<QueueSummaryDto>, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let sql = r#"
        SELECT 
          destination_id AS destinationId,
          MAX(destination_name) AS destinationName,
          COUNT(*)::bigint AS totalVehicles,
          COUNT(*) FILTER (WHERE status = 'WAITING')::bigint AS waitingVehicles,
          COUNT(*) FILTER (WHERE status = 'LOADING')::bigint AS loadingVehicles,
          COUNT(*) FILTER (WHERE status = 'READY')::bigint AS readyVehicles,
          NULL::text AS governorate,
          NULL::text AS delegation
        FROM vehicle_queue
        GROUP BY destination_id
        ORDER BY destinationName
    "#;
    let rows = client.query(sql, &[]).await.map_err(|e| e.to_string())?;
    let data = rows.into_iter().map(|r| QueueSummaryDto {
        destinationId: r.get("destinationid"),
        destinationName: r.get("destinationname"),
        totalVehicles: r.get("totalvehicles"),
        waitingVehicles: r.get("waitingvehicles"),
        loadingVehicles: r.get("loadingvehicles"),
        readyVehicles: r.get("readyvehicles"),
        governorate: r.get("governorate"),
        delegation: r.get("delegation"),
    }).collect();
    Ok(data)
}

#[tauri::command]
async fn db_get_queue_by_destination(destination_id: String) -> Result<Vec<QueueItemDto>, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let sql = r#"
        SELECT q.id,
               q.destination_id,
               q.destination_name,
               q.queue_position,
               q.status,
               q.available_seats,
               q.total_seats,
               q.base_price,
               v.license_plate
        FROM vehicle_queue q
        JOIN vehicles v ON v.id = q.vehicle_id
        WHERE q.destination_id = $1
        ORDER BY q.queue_position ASC
    "#;
    let rows = client.query(sql, &[&destination_id]).await.map_err(|e| e.to_string())?;
    let mut items = Vec::with_capacity(rows.len());
    for r in rows.iter() {
        items.push(map_queue_row(r).await);
    }
    Ok(items)
}

#[tauri::command]
async fn db_get_vehicle_authorized_destinations(license_plate: String) -> Result<Vec<AuthorizedDestinationDto>, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let sql = r#"
        SELECT vas.station_id,
               COALESCE(vas.station_name, r.station_name) AS station_name,
               COALESCE(r.base_price, 0)::float8 AS base_price,
               vas.is_default,
               vas.priority
        FROM vehicle_authorized_stations vas
        JOIN vehicles v ON v.id = vas.vehicle_id
        LEFT JOIN routes r ON r.station_id = vas.station_id
        WHERE v.license_plate = $1
        ORDER BY vas.is_default DESC, vas.priority ASC
    "#;
    let rows = client.query(sql, &[&license_plate]).await.map_err(|e| e.to_string())?;
    let data = rows.into_iter().map(|r| AuthorizedDestinationDto {
        stationId: r.get("station_id"),
        stationName: r.get("station_name"),
        basePrice: r.get("base_price"),
        isDefault: r.get("is_default"),
        priority: r.get("priority"),
    }).collect();
    Ok(data)
}

#[tauri::command]
async fn db_enter_queue(license_plate: String, destination_id: String, destination_name: Option<String>, staff_id: Option<String>) -> Result<String, String> {
    let mut client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let tx = client.build_transaction().start().await.map_err(|e| e.to_string())?;

    // Find vehicle by license plate
    let veh_row_opt = tx.query_opt("SELECT id, capacity, is_active FROM vehicles WHERE license_plate = $1", &[&license_plate])
        .await.map_err(|e| e.to_string())?;
    if veh_row_opt.is_none() {
        return Err(format!("Véhicule introuvable: {}", license_plate));
    }
    let veh_row = veh_row_opt.unwrap();
    let vehicle_id: String = veh_row.get("id");
    let total_seats: i32 = veh_row.get::<_, i32>("capacity");
    let is_active: bool = veh_row.get::<_, bool>("is_active");
    if !is_active {
        return Err(format!("Véhicule inactif: {}", license_plate));
    }

    // Next position
    let pos_row = tx.query_one("SELECT COALESCE(MAX(queue_position), 0)+1 AS next_pos FROM vehicle_queue WHERE destination_id = $1", &[&destination_id])
        .await.map_err(|e| e.to_string())?;
    let next_pos: i32 = pos_row.get("next_pos");

    // Base price and destination name resolution
    let price_row = tx.query_opt("SELECT base_price, station_name FROM routes WHERE station_id = $1", &[&destination_id])
        .await.map_err(|e| e.to_string())?;
    let mut base_price: f64 = 0.0;
    let mut resolved_name: Option<String> = None;
    if let Some(r) = price_row {
        base_price = r.get::<_, f64>("base_price");
        let n: String = r.get("station_name");
        if !n.is_empty() { resolved_name = Some(n); }
    }
    // Fallback to provided name
    if resolved_name.is_none() {
        if let Some(n) = &destination_name { resolved_name = Some(n.clone()); }
    }
    // Enforce authorization exists for provided destination (strict mode)
    let auth_opt = tx.query_opt(
        "SELECT COALESCE(station_name, '') AS name FROM vehicle_authorized_stations WHERE vehicle_id = $1 AND station_id = $2",
        &[&vehicle_id, &destination_id]
    ).await.map_err(|e| e.to_string())?;
    if let Some(nr) = auth_opt {
        let n: String = nr.get("name");
        if resolved_name.is_none() && !n.is_empty() { resolved_name = Some(n); }
    } else {
        return Err(format!("Véhicule {} non autorisé pour la destination {}", license_plate, destination_id));
    }
    let dest_name = resolved_name.unwrap_or_else(|| destination_id.clone());

    // If vehicle already in queue, move it to the new destination instead of failing
    if let Some(existing) = tx.query_opt(
        "SELECT id, destination_name FROM vehicle_queue WHERE vehicle_id = $1",
        &[&vehicle_id]
    ).await.map_err(|e| e.to_string())? {
        let qid: String = existing.get("id");
        // Update queue entry to new destination and position
        tx.execute(
            "UPDATE vehicle_queue SET destination_id = $1, destination_name = $2, queue_position = $3, base_price = $4 WHERE id = $5",
            &[&destination_id, &dest_name, &next_pos, &base_price, &qid]
        ).await.map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;

        // After commit: ALWAYS print day pass ticket when changing destination (non-blocking)
        let lp_clone = license_plate.clone();
        let dest_name_clone = dest_name.clone();
        println!("🚀 [QUEUE DEBUG] Spawning day pass print task for vehicle: {} to destination: {} (DESTINATION CHANGE)", lp_clone, dest_name_clone);
        tauri::async_runtime::spawn(async move {
            let lp_debug = lp_clone.clone();
            println!("🎯 [QUEUE DEBUG] Starting day pass print task for vehicle: {} to destination: {} (DESTINATION CHANGE)", lp_clone, dest_name_clone);
            
            // Add a small delay to ensure database transaction is fully committed
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            
        // Always print day pass ticket when changing destination
        let result = print_entry_or_daypass_if_needed(lp_clone, dest_name_clone, 2.0, None).await;
            match result {
                Ok(_) => println!("✅ [QUEUE DEBUG] Day pass print task completed successfully for {} (DESTINATION CHANGE)", lp_debug),
                Err(e) => {
                    println!("❌ [QUEUE DEBUG] Day pass print task failed for {} (DESTINATION CHANGE): {}", lp_debug, e);
                    eprintln!("❌ [DAY PASS ERROR] Failed to print day pass for {} (DESTINATION CHANGE): {}", lp_debug, e);
                }
            }
        });
        return Ok(qid);
    }

    // Insert new queue entry (without queue_type column to match existing DB)
    let qid = uuid::Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO vehicle_queue (id, vehicle_id, destination_id, destination_name, queue_position, status, entered_at, available_seats, total_seats, base_price) VALUES ($1,$2,$3,$4,$5,'WAITING',NOW(),$6,$7,$8)",
        &[&qid, &vehicle_id, &destination_id, &dest_name, &next_pos, &(total_seats as i32), &(total_seats as i32), &base_price]
    ).await.map_err(|e| format!("Insertion dans la file échouée: {}", e))?;

    tx.commit().await.map_err(|e| e.to_string())?;

    // After commit: ALWAYS create/print day pass ticket (non-blocking)
    let lp_clone = license_plate.clone();
    let dest_name_clone = dest_name.clone();
    println!("🚀 [QUEUE DEBUG] Spawning day pass print task for vehicle: {} to destination: {} (NEW ENTRY)", lp_clone, dest_name_clone);
    tauri::async_runtime::spawn(async move {
        let lp_debug = lp_clone.clone();
        println!("🎯 [QUEUE DEBUG] Starting day pass print task for vehicle: {} to destination: {} (NEW ENTRY)", lp_clone, dest_name_clone);
        
        // Add a small delay to ensure database transaction is fully committed
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        
        // Always print day pass ticket for new queue entry
        let result = print_entry_or_daypass_if_needed(lp_clone, dest_name_clone, 2.0, staff_id.clone()).await;
        match result {
            Ok(_) => println!("✅ [QUEUE DEBUG] Day pass print task completed successfully for {} (NEW ENTRY)", lp_debug),
            Err(e) => {
                println!("❌ [QUEUE DEBUG] Day pass print task failed for {} (NEW ENTRY): {}", lp_debug, e);
                // Also log to stderr for better visibility
                eprintln!("❌ [DAY PASS ERROR] Failed to print day pass for {} (NEW ENTRY): {}", lp_debug, e);
            }
        }
    });
    Ok(qid)
}

// Decide printing path depending on day pass status.
async fn print_entry_or_daypass_if_needed(license_plate: String, destination_name: String, create_day_pass_price: f64, staff_id: Option<String>) -> Result<(), String> {
    println!("🔄 [ENTRY TICKET DEBUG] ===== STARTING ENTRY TICKET CHECK =====");
    println!("🔄 [ENTRY TICKET DEBUG] Vehicle: {}", license_plate);
    println!("🔄 [ENTRY TICKET DEBUG] Destination: {}", destination_name);
    
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    
    // Get current Tunisian date for comparison
    let now_tunisian = chrono::Utc::now().with_timezone(&chrono_tz::Africa::Tunis);
    let today_date = now_tunisian.date_naive();
    
    println!("📅 [ENTRY TICKET DEBUG] Checking for day pass on Tunisian date: {}", today_date.format("%Y-%m-%d"));
    
    // Check if day pass exists for TODAY using Tunisian time
    let day_pass_row = client.query_opt(
        "SELECT id, price, (purchase_date AT TIME ZONE 'Africa/Tunis') AS purchase_date
         FROM day_passes
         WHERE license_plate = $1
           AND is_active = true
           AND (purchase_date AT TIME ZONE 'Africa/Tunis')::date = (NOW() AT TIME ZONE 'Africa/Tunis')::date
           AND (NOW() AT TIME ZONE 'Africa/Tunis') BETWEEN (valid_from AT TIME ZONE 'Africa/Tunis') AND (valid_until AT TIME ZONE 'Africa/Tunis')
         ORDER BY purchase_date DESC LIMIT 1",
        &[&license_plate]
    ).await.map_err(|e| e.to_string())?;

    // Get printer service for printing
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let guard = printer.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };
    
    // Get staff information from parameter or fallback to printer service
    let staff_info = if let Some(staff_id) = staff_id {
        // Get staff info from database using the provided staff_id
        let staff_row = client.query_opt(
            "SELECT id, first_name, last_name FROM staff WHERE id = $1",
            &[&staff_id]
        ).await.map_err(|e| e.to_string())?;
        
        if let Some(row) = staff_row {
            Some(StaffInfo {
                id: row.get("id"),
                cin: "".to_string(), // Not needed for day pass
                firstName: row.get("first_name"),
                lastName: row.get("last_name"),
                role: "STAFF".to_string(), // Default role
                phoneNumber: None,
            })
        } else {
            None
        }
    } else {
        // Fallback: derive staff from latest active session stored locally
        // Prefer most recent active session; if unavailable, return None
        let session_row = client.query_opt(
            "SELECT s.id, st.first_name, st.last_name
             FROM sessions s
             JOIN staff st ON st.id = s.staff_id
             WHERE s.is_active = true
             ORDER BY s.last_activity DESC
             LIMIT 1",
            &[]
        ).await.map_err(|e| e.to_string())?;

        if let Some(r) = session_row {
            Some(StaffInfo {
                id: r.get("id"),
                cin: "".to_string(),
                firstName: r.get("first_name"),
                lastName: r.get("last_name"),
                role: "STAFF".to_string(),
                phoneNumber: None,
            })
        } else {
            None
        }
    };
    
    // Use the destination passed from queue entry function
    let queue_destination = destination_name.clone();
    let queue_position = 1; // Default position, will be updated if needed
    
    println!("🎯 [ENTRY TICKET DEBUG] Using destination from queue entry: {}", queue_destination);
    
    if let Some(row) = day_pass_row {
        let day_pass_price: f64 = row.get("price");
        let purchase_date: chrono::NaiveDateTime = row.get("purchase_date");
        let tunisian_time = chrono_tz::Africa::Tunis
            .from_local_datetime(&purchase_date)
            .single()
            .unwrap_or_else(|| chrono_tz::Africa::Tunis.timestamp(purchase_date.and_utc().timestamp(), 0));
        
        println!("✅ [ENTRY TICKET DEBUG] Found existing day pass for {} - printing entry ticket with 0 TND", license_plate);
        
        // Print ENTRY TICKET with 0 TND (valid day pass)
        let entry_ticket_number = format!("ENTRY-{}", chrono::Utc::now().timestamp_millis());
        let entry_ticket = serde_json::json!({
            "ticketNumber": entry_ticket_number,
            "licensePlate": license_plate,
            "destinationName": queue_destination,
            "queuePosition": queue_position,
            "entryTime": now_tunisian.format("%Y-%m-%d %H:%M:%S").to_string(),
            "ticketPrice": "0.00", // 0 TND because day pass is valid
            "dayPassStatus": "VALID",
            "dayPassPurchaseDate": tunisian_time.format("%Y-%m-%d %H:%M:%S").to_string(),
            "staffName": staff_info.as_ref().map(|s| format!("{} {}", s.firstName, s.lastName)).unwrap_or_else(|| "Staff".to_string()),
            "staffId": staff_info.as_ref().map(|s| s.id.clone()).unwrap_or_else(|| "SYSTEM".to_string())
        }).to_string();
        
        println!("🎫 [ENTRY TICKET DEBUG] Generated entry ticket data (0 TND): {}", entry_ticket);
        
        let print_result = printer_clone.print_entry_ticket(entry_ticket, None).await;
        match print_result {
            Ok(result) => {
                println!("✅ [ENTRY TICKET DEBUG] Entry ticket printed successfully for {}: {}", license_plate, result);
            },
            Err(e) => {
                println!("❌ [ENTRY TICKET DEBUG] Failed to print entry ticket for {}: {}", license_plate, e);
                eprintln!("❌ [ENTRY TICKET ERROR] Entry ticket print failed for {}: {}", license_plate, e);
            }
        }
        return Ok(());
    } else {
        println!("ℹ️ [DAY PASS DEBUG] No existing day pass found for {} - creating and printing day pass ticket with 2 TND", license_plate);
        println!("🎯 [DAY PASS DEBUG] Using destination from queue: {}", queue_destination);
        
        // First, get the vehicle ID for the license plate
        let vehicle_row = client.query_opt(
            "SELECT id FROM vehicles WHERE license_plate = $1",
            &[&license_plate]
        ).await.map_err(|e| e.to_string())?;
        
        if let Some(row) = vehicle_row {
            let vehicle_id: String = row.get("id");
            
            // Create the day pass in the database
            let day_pass_id = uuid::Uuid::new_v4().to_string();
            
            // Ensure we use a valid staff ID - validate against database
            let staff_id = if let Some(staff) = &staff_info {
                // Verify the staff ID exists in the database
                let staff_exists = client.query_opt(
                    "SELECT id FROM staff WHERE id = $1",
                    &[&staff.id]
                ).await.map_err(|e| e.to_string())?;
                
                if staff_exists.is_some() {
                    staff.id.clone()
                } else {
                    println!("⚠️ [DAY PASS DEBUG] Staff ID {} not found in database, using fallback", staff.id);
                    "staff_1758995428363_2nhfegsve".to_string()
                }
            } else {
                "staff_1758995428363_2nhfegsve".to_string()
            };
            
            let final_price = 2.0; // Hardcoded 2 TND
            
            // Get current Tunisian time
            let now_tunisian = chrono::Utc::now().with_timezone(&chrono_tz::Africa::Tunis);
            let today_start = now_tunisian.date_naive().and_hms_opt(0, 0, 0).unwrap();
            let today_end = now_tunisian.date_naive().and_hms_opt(23, 59, 59).unwrap();
            
            // Convert to UTC for database storage
            let now_utc = now_tunisian.with_timezone(&chrono::Utc);
            let today_start_utc = today_start.and_local_timezone(chrono_tz::Africa::Tunis).unwrap().with_timezone(&chrono::Utc);
            let today_end_utc = today_end.and_local_timezone(chrono_tz::Africa::Tunis).unwrap().with_timezone(&chrono::Utc);
            
            // Insert the day pass into the database
            let insert_result = client.execute(
                "INSERT INTO day_passes (id, vehicle_id, license_plate, price, purchase_date, valid_from, valid_until, is_active, is_expired, created_by, created_at, updated_at) 
                 VALUES ($1,$2,$3,$4, $5 AT TIME ZONE 'Africa/Tunis', $6 AT TIME ZONE 'Africa/Tunis', $7 AT TIME ZONE 'Africa/Tunis', true, false, $8, $5 AT TIME ZONE 'Africa/Tunis', $5 AT TIME ZONE 'Africa/Tunis')",
                &[&day_pass_id, &vehicle_id, &license_plate, &final_price, &now_utc, &today_start_utc, &today_end_utc, &staff_id]
            ).await;
            
            match insert_result {
                Ok(_) => {
                    println!("✅ [DAY PASS DEBUG] Day pass database record created successfully for {}", license_plate);
                },
                Err(e) => {
                    println!("❌ [DAY PASS DEBUG] Failed to create day pass database record for {}: {}", license_plate, e);
                    eprintln!("❌ [DAY PASS ERROR] Database record creation failed for {}: {}", license_plate, e);
                    return Err(format!("Failed to create day pass database record: {}", e));
                }
            }
            
            // Print DAY PASS TICKET with hardcoded 2 TND (for people without valid day pass)
            let day_pass_ticket_number = format!("DAYPASS-{}", chrono::Utc::now().timestamp_millis());
            let day_pass_ticket = serde_json::json!({
                "ticketNumber": day_pass_ticket_number,
                "licensePlate": license_plate,
                "destinationName": queue_destination,
                "amount": 2.0, // Hardcoded 2 TND
                "purchaseDate": now_tunisian.format("%Y-%m-%d %H:%M:%S").to_string(),
                "validFor": now_tunisian.format("%Y-%m-%d").to_string(),
                "staffName": staff_info.as_ref().map(|s| format!("{} {}", s.firstName, s.lastName)).unwrap_or_else(|| "Staff".to_string()),
                "staffId": staff_info.as_ref().map(|s| s.id.clone()).unwrap_or_else(|| "SYSTEM".to_string())
            }).to_string();
            
            println!("🎫 [DAY PASS DEBUG] Generated day pass ticket data (2 TND): {}", day_pass_ticket);
            
            let print_result = printer_clone.print_day_pass_ticket(day_pass_ticket, None).await;
            match print_result {
                Ok(result) => {
                    println!("✅ [DAY PASS DEBUG] Day pass ticket printed successfully for {}: {}", license_plate, result);
                },
                Err(e) => {
                    println!("❌ [DAY PASS DEBUG] Failed to print day pass ticket for {}: {}", license_plate, e);
                    eprintln!("❌ [DAY PASS ERROR] Day pass ticket print failed for {}: {}", license_plate, e);
                }
            }
        } else {
            println!("❌ [DAY PASS DEBUG] Vehicle not found for license plate: {}", license_plate);
            return Err(format!("Vehicle not found for license plate: {}", license_plate));
        }
    }
    
    Ok(())
}

#[tauri::command]
async fn db_exit_queue(license_plate: String) -> Result<u64, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let sql = r#"DELETE FROM vehicle_queue WHERE vehicle_id = (SELECT id FROM vehicles WHERE license_plate = $1)"#;
    let res = client.execute(sql, &[&license_plate]).await.map_err(|e| e.to_string())?;
    Ok(res)
}

#[tauri::command]
async fn db_update_vehicle_status(license_plate: String, status: String) -> Result<u64, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    // Update status for the vehicle's current queue entry
    let sql = r#"UPDATE vehicle_queue
                 SET status = $1
                 WHERE vehicle_id = (SELECT id FROM vehicles WHERE license_plate = $2)"#;
    let res = client.execute(sql, &[&status, &license_plate]).await.map_err(|e| e.to_string())?;
    Ok(res)
}

#[tauri::command]
async fn db_has_day_pass_today(license_plate: String) -> Result<bool, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    // Use Africa/Tunis local day
    let exists = client
        .query_opt(
            "SELECT id FROM day_passes WHERE license_plate = $1 AND is_active = true AND (purchase_date AT TIME ZONE 'Africa/Tunis')::date = (NOW() AT TIME ZONE 'Africa/Tunis')::date",
            &[&license_plate],
        )
        .await
        .map_err(|e| e.to_string())?
        .is_some();
    Ok(exists)
}

#[tauri::command]
async fn db_has_day_pass_today_batch(license_plates: Vec<String>) -> Result<std::collections::HashMap<String, bool>, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    if license_plates.is_empty() {
        return Ok(std::collections::HashMap::new());
    }
    // Query all plates at once using ANY($1)
    let rows = client.query(
        "SELECT license_plate, true as has
         FROM day_passes
         WHERE is_active = true
           AND (purchase_date AT TIME ZONE 'Africa/Tunis')::date = (NOW() AT TIME ZONE 'Africa/Tunis')::date
           AND license_plate = ANY($1)",
        &[&license_plates]
    ).await.map_err(|e| e.to_string())?;

    let mut map = std::collections::HashMap::new();
    for lp in license_plates.iter() {
        map.insert(lp.clone(), false);
    }
    for r in rows.into_iter() {
        let lp: String = r.get("license_plate");
        map.insert(lp, true);
    }
    Ok(map)
}

#[tauri::command]
async fn db_health() -> Result<bool, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let row = client.query_one("SELECT 1 as ok", &[]).await.map_err(|e| e.to_string())?;
    let ok: i32 = row.get("ok");
    Ok(ok == 1)
}

// =============== BOOKING FLOW COMMANDS (DB-direct) ===============

#[derive(Debug, Serialize, Deserialize)]
struct BookingDestinationDto {
    destinationId: String,
    destinationName: String,
    totalAvailableSeats: i64,
    vehicleCount: i64,
    governorate: Option<String>,
    governorateAr: Option<String>,
    delegation: Option<String>,
    delegationAr: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DayPassDto {
    id: String,
    vehicleId: String,
    licensePlate: String,
    price: f64,
    purchaseDate: String,
    validFrom: String,
    validUntil: String,
    isActive: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct ExitPassDto {
    id: String,
    vehicleId: String,
    licensePlate: String,
    destinationId: String,
    destinationName: String,
    currentExitTime: String,
    createdAt: String,
}

#[tauri::command]
async fn db_get_today_day_passes() -> Result<Vec<DayPassDto>, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let rows = client.query(
        r#"SELECT id, vehicle_id, license_plate, price,
                  (purchase_date AT TIME ZONE 'Africa/Tunis') AS purchase_date,
                  (valid_from AT TIME ZONE 'Africa/Tunis') AS valid_from,
                  (valid_until AT TIME ZONE 'Africa/Tunis') AS valid_until,
                  is_active
           FROM day_passes
           WHERE is_active = true
             AND (purchase_date AT TIME ZONE 'Africa/Tunis')::date = (NOW() AT TIME ZONE 'Africa/Tunis')::date
           ORDER BY purchase_date DESC"#,
        &[]
    ).await.map_err(|e| e.to_string())?;
    let list = rows.into_iter().map(|r| DayPassDto{
        id: r.get("id"),
        vehicleId: r.get("vehicle_id"),
        licensePlate: r.get("license_plate"),
        price: r.get::<_, f64>("price"),
            purchaseDate: r.get::<_, chrono::DateTime<chrono::Utc>>("purchase_date").format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
            validFrom: r.get::<_, chrono::DateTime<chrono::Utc>>("valid_from").format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
            validUntil: r.get::<_, chrono::DateTime<chrono::Utc>>("valid_until").format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        isActive: r.get("is_active"),
    }).collect();
    Ok(list)
}

#[tauri::command]
async fn db_get_today_exit_passes() -> Result<Vec<ExitPassDto>, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let rows = client.query(
        r#"SELECT id, vehicle_id, license_plate, destination_id, destination_name,
                  (current_exit_time AT TIME ZONE 'Africa/Tunis') AS current_exit_time,
                  (created_at AT TIME ZONE 'Africa/Tunis') AS created_at
           FROM exit_passes
           WHERE (current_exit_time AT TIME ZONE 'Africa/Tunis')::date = (NOW() AT TIME ZONE 'Africa/Tunis')::date
           ORDER BY current_exit_time DESC"#,
        &[]
    ).await.map_err(|e| e.to_string())?;
    let list = rows.into_iter().map(|r| ExitPassDto{
        id: r.get("id"),
        vehicleId: r.get("vehicle_id"),
        licensePlate: r.get("license_plate"),
        destinationId: r.get("destination_id"),
        destinationName: r.get("destination_name"),
        currentExitTime: r.get::<_, chrono::NaiveDateTime>("current_exit_time").format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        createdAt: r.get::<_, chrono::NaiveDateTime>("created_at").format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
    }).collect();
    Ok(list)
}

#[tauri::command]
async fn db_get_recent_exit_passes() -> Result<Vec<ExitPassDto>, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let rows = client.query(
        r#"SELECT id, vehicle_id, license_plate, destination_id, destination_name,
                  (current_exit_time AT TIME ZONE 'Africa/Tunis') AS current_exit_time,
                  (created_at AT TIME ZONE 'Africa/Tunis') AS created_at
           FROM exit_passes
           WHERE current_exit_time >= NOW() - INTERVAL '10 minutes'
           ORDER BY current_exit_time DESC
           LIMIT 20"#,
        &[]
    ).await.map_err(|e| e.to_string())?;
    let list = rows.into_iter().map(|r| ExitPassDto{
        id: r.get("id"),
        vehicleId: r.get("vehicle_id"),
        licensePlate: r.get("license_plate"),
        destinationId: r.get("destination_id"),
        destinationName: r.get("destination_name"),
        currentExitTime: r.get::<_, chrono::NaiveDateTime>("current_exit_time").format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        createdAt: r.get::<_, chrono::NaiveDateTime>("created_at").format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
    }).collect();
    Ok(list)
}

#[derive(Debug, Serialize, Deserialize)]
struct VehicleWithoutDayPassDto {
    licensePlate: String,
    destinationId: String,
    destinationName: String,
    queueId: String,
}

#[tauri::command]
async fn db_get_queued_without_day_pass() -> Result<Vec<VehicleWithoutDayPassDto>, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let rows = client.query(
        r#"SELECT v.license_plate, q.destination_id, q.destination_name, q.id AS queue_id
           FROM vehicle_queue q
           JOIN vehicles v ON v.id = q.vehicle_id
           WHERE q.status IN ('WAITING','LOADING','READY')
             AND NOT EXISTS (
               SELECT 1 FROM day_passes dp
               WHERE dp.license_plate = v.license_plate
                 AND dp.is_active = true
                 AND (dp.purchase_date AT TIME ZONE 'Africa/Tunis')::date = (NOW() AT TIME ZONE 'Africa/Tunis')::date
             )
           ORDER BY q.destination_name, q.queue_position"#,
        &[]
    ).await.map_err(|e| e.to_string())?;
    let list = rows.into_iter().map(|r| VehicleWithoutDayPassDto{
        licensePlate: r.get("license_plate"),
        destinationId: r.get("destination_id"),
        destinationName: r.get("destination_name"),
        queueId: r.get("queue_id"),
    }).collect();
    Ok(list)
}

#[derive(Debug, Serialize, Deserialize)]
struct DestinationVehiclesDto {
    totalAvailableSeats: i64,
    vehicles: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
struct BookingCreatedDto {
    bookings: Vec<serde_json::Value>,
    totalAmount: f64,
}

#[tauri::command]
async fn db_get_available_booking_destinations(governorate: Option<String>, delegation: Option<String>) -> Result<Vec<BookingDestinationDto>, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let mut sql = String::from(
        r#"
        SELECT q.destination_id AS destinationId,
               MAX(q.destination_name) AS destinationName,
               SUM(q.available_seats)::bigint AS totalAvailableSeats,
               COUNT(*)::bigint AS vehicleCount,
               MAX(r.governorate) AS governorate,
               MAX(r.governorate_ar) AS governorateAr,
               MAX(r.delegation) AS delegation,
               MAX(r.delegation_ar) AS delegationAr
        FROM vehicle_queue q
        LEFT JOIN routes r ON r.station_id = q.destination_id
        WHERE q.available_seats > 0
        "#
    );
    let mut params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = Vec::new();
    let mut _idx = 1;
    if let Some(g) = &governorate {
        sql.push_str(&format!(" AND r.governorate = ${}", _idx));
        params.push(g);
        _idx += 1;
    }
    if let Some(d) = &delegation {
        sql.push_str(&format!(" AND r.delegation = ${}", _idx));
        params.push(d);
        _idx += 1;
    }
    sql.push_str(" GROUP BY q.destination_id ORDER BY destinationName");
    let rows = client.query(&sql, &params).await.map_err(|e| e.to_string())?;
    let list = rows.into_iter().map(|r| BookingDestinationDto {
        destinationId: r.get("destinationid"),
        destinationName: r.get("destinationname"),
        totalAvailableSeats: r.get("totalavailableseats"),
        vehicleCount: r.get("vehiclecount"),
        governorate: r.get("governorate"),
        governorateAr: r.get("governoratear"),
        delegation: r.get("delegation"),
        delegationAr: r.get("delegationar"),
    }).collect();
    Ok(list)
}

#[tauri::command]
async fn db_get_available_seats_for_destination(destination_id: String) -> Result<DestinationVehiclesDto, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let rows = client.query(
        r#"
        SELECT q.id, q.available_seats, q.total_seats, q.base_price, v.license_plate
        FROM vehicle_queue q
        JOIN vehicles v ON v.id = q.vehicle_id
        WHERE q.destination_id = $1 AND q.available_seats > 0
        ORDER BY q.queue_position ASC
        "#,
        &[&destination_id]
    ).await.map_err(|e| e.to_string())?;
    let mut total: i64 = 0;
    let mut vehicles: Vec<serde_json::Value> = Vec::new();
    for r in rows.iter() {
        let avail: i32 = r.get("available_seats");
        total += avail as i64;
        vehicles.push(serde_json::json!({
            "queueId": r.get::<_, String>("id"),
            "availableSeats": avail,
            "totalSeats": r.get::<_, i32>("total_seats"),
            "basePrice": r.get::<_, f64>("base_price"),
            "licensePlate": r.get::<_, String>("license_plate"),
        }));
    }
    Ok(DestinationVehiclesDto { totalAvailableSeats: total, vehicles })
}

#[tauri::command]
async fn db_create_queue_booking(destination_id: String, seats_requested: i32, created_by: Option<String>) -> Result<BookingCreatedDto, String> {
    if seats_requested <= 0 { return Err("seats_requested must be > 0".into()); }
    let mut client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let tx = client.build_transaction().start().await.map_err(|e| e.to_string())?;

    // Get staff name for display purposes
    let staff_name = if let Some(staff_id) = &created_by {
        let staff_row = tx.query_opt(
            "SELECT first_name, last_name FROM staff WHERE id = $1",
            &[staff_id]
        ).await.map_err(|e| e.to_string())?;
        
        if let Some(row) = staff_row {
            let first_name: String = row.get("first_name");
            let last_name: String = row.get("last_name");
            Some(format!("{} {}", first_name, last_name))
        } else {
            Some("Unknown Staff".to_string())
        }
    } else {
        Some("System".to_string())
    };
    
    println!("🎫 [BOOKING DEBUG] Staff name for display: {:?}", staff_name);

    let mut remaining = seats_requested;
    let mut bookings: Vec<serde_json::Value> = Vec::new();
    let mut total_amount: f64 = 0.0;
    let mut exit_passes_to_print: Vec<serde_json::Value> = Vec::new();
    let queue_rows = tx.query(
        r#"
        SELECT q.id, q.available_seats, q.total_seats, q.base_price, v.license_plate, q.queue_position
        FROM vehicle_queue q
        JOIN vehicles v ON v.id = q.vehicle_id
        WHERE q.destination_id = $1 AND q.available_seats > 0
        ORDER BY q.queue_position ASC
        FOR UPDATE
        "#,
        &[&destination_id]
    ).await.map_err(|e| e.to_string())?;

    println!("🎫 [BOOKING DEBUG] Found {} vehicles in queue for destination {}", queue_rows.len(), destination_id);
    println!("🎫 [BOOKING DEBUG] Requesting {} seats", seats_requested);

    // First, try to find a single vehicle that can accommodate all requested seats
    let mut single_vehicle_booking = None;
    for r in queue_rows.iter() {
        let _qid: String = r.get("id");
        let _avail: i32 = r.get("available_seats");
        let queue_position: i32 = r.get("queue_position");
        
        println!("🎫 [BOOKING DEBUG] Checking vehicle at position {}: {} available seats", queue_position, _avail);
        
        if _avail >= seats_requested {
            println!("🎫 [BOOKING DEBUG] Found vehicle at position {} with enough seats ({} >= {})", queue_position, _avail, seats_requested);
            single_vehicle_booking = Some(r);
            break;
        }
    }

    // If we found a single vehicle that can handle all seats, book from it
    if let Some(r) = single_vehicle_booking {
        let qid: String = r.get("id");
        let _avail: i32 = r.get("available_seats");
        let base_price: f64 = r.get("base_price");
        let license_plate: String = r.get("license_plate");
        let queue_position: i32 = r.get("queue_position");
        
        println!("🎫 [BOOKING DEBUG] Booking all {} seats from vehicle at position {} ({}: {})", seats_requested, queue_position, license_plate, qid);
        
        let take = seats_requested; // Book all requested seats from this vehicle
        remaining = 0; // All seats will be booked from this vehicle

        tx.execute("UPDATE vehicle_queue SET available_seats = available_seats - $1 WHERE id = $2", &[&take, &qid])
            .await.map_err(|e| e.to_string())?;

        // Check if this is the first booking on this vehicle (status is WAITING)
        let status_row = tx.query_opt(
            "SELECT status FROM vehicle_queue WHERE id = $1",
            &[&qid]
        ).await.map_err(|e| e.to_string())?;
        
        if let Some(row) = status_row {
            let current_status: String = row.get("status");
            if current_status == "WAITING" {
                println!("🚌 [STATUS CHANGE] Changing vehicle {} from WAITING to LOADING (first booking)", license_plate);
                tx.execute("UPDATE vehicle_queue SET status = 'LOADING' WHERE id = $1", &[&qid])
                    .await.map_err(|e| e.to_string())?;
            }
        }

        let bid = uuid::Uuid::new_v4().to_string();
        let verification_code = uuid::Uuid::new_v4().to_string();
        let base_amount = base_price * (take as f64);
        let service_fee = 0.200 * (take as f64); // Fixed 0.200 TND service fee per seat
        let amount = base_amount + service_fee;
        total_amount += amount;
        
        tx.execute(
            r#"INSERT INTO bookings (id, queue_id, seats_booked, total_amount, booking_source, booking_type, payment_status, payment_method, verification_code, created_offline, created_by, created_at)
                VALUES ($1,$2,$3,$4,'CASH_STATION','CASH','PAID','CASH',$5,false,$6,NOW())"#,
            &[&bid, &qid, &take, &amount, &verification_code, &created_by]
        ).await.map_err(|e| e.to_string())?;

        // Get destination name and vehicle capacity for the booking
        let vehicle_info_row = tx.query_opt(
            "SELECT destination_name, v.capacity FROM vehicle_queue q JOIN vehicles v ON v.id = q.vehicle_id WHERE q.id = $1",
            &[&qid]
        ).await.map_err(|e| e.to_string())?;
        
        let (destination_name, vehicle_capacity) = if let Some(row) = vehicle_info_row {
            (
                row.get::<_, String>("destination_name"),
                row.get::<_, i32>("capacity")
            )
        } else {
            ("Unknown Destination".to_string(), 8)
        };

        bookings.push(serde_json::json!({
            "id": bid,
            "queueId": qid,
            "seatsBooked": take,
            "baseAmount": base_amount,
            "serviceFeeAmount": service_fee,
            "totalAmount": amount,
            "verificationCode": verification_code,
            "vehicleLicensePlate": license_plate,
            "destinationId": destination_id,
            "destinationName": destination_name,
            "vehicleCapacity": vehicle_capacity,
            "staffName": staff_name.clone(),
            "staffId": created_by.clone(),
        }));

        // Check if this vehicle became fully booked and needs exit pass
        let row_after = tx.query_one(
            "SELECT q.available_seats, q.total_seats, q.destination_id, q.destination_name, q.vehicle_id, v.license_plate, v.capacity \
             FROM vehicle_queue q JOIN vehicles v ON v.id = q.vehicle_id WHERE q.id = $1",
            &[&qid]
        ).await.map_err(|e| e.to_string())?;
        let avail_after: i32 = row_after.get("available_seats");
        if avail_after == 0 {
            // Update vehicle status to READY when fully booked
            println!("🚌 [STATUS CHANGE] Changing vehicle {} from LOADING to READY (fully booked)", license_plate);
            tx.execute("UPDATE vehicle_queue SET status = 'READY' WHERE id = $1", &[&qid])
                .await.map_err(|e| e.to_string())?;
            
            let destination_id_row: String = row_after.get("destination_id");
            let destination_name_row: String = row_after.get("destination_name");
            let vehicle_id_row: String = row_after.get("vehicle_id");
            let license_plate_row: String = row_after.get("license_plate");
            let vehicle_capacity: i32 = row_after.get("capacity");

            // Get route base price for total calculation
            let route_row = tx.query_opt(
                "SELECT base_price FROM routes WHERE station_id = $1",
                &[&destination_id_row]
            ).await.map_err(|e| e.to_string())?;
            let base_price: f64 = route_row.map(|r| r.get::<_, f64>("base_price")).unwrap_or(0.0);
            let total_price = base_price * (vehicle_capacity as f64);

            // Get previous vehicle exit info for same destination today
            let prev_exit_row = tx.query_opt(
                r#"SELECT license_plate, current_exit_time::text as current_exit_time
                   FROM exit_passes 
                   WHERE destination_id = $1 
                     AND (current_exit_time AT TIME ZONE 'Africa/Tunis')::date = (NOW() AT TIME ZONE 'Africa/Tunis')::date
                   ORDER BY current_exit_time DESC 
                   LIMIT 1"#,
                &[&destination_id_row]
            ).await.map_err(|e| e.to_string())?;

            let exit_id = uuid::Uuid::new_v4().to_string();
            tx.execute(
                r#"INSERT INTO exit_passes (
                        id, queue_id, vehicle_id, license_plate, destination_id, destination_name, current_exit_time, created_by, created_at
                    ) VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,NOW())"#,
                &[&exit_id, &qid, &vehicle_id_row, &license_plate_row, &destination_id_row, &destination_name_row, &created_by]
            ).await.map_err(|e| e.to_string())?;

            // schedule print after commit with all required data
            exit_passes_to_print.push(serde_json::json!({
                "id": exit_id,
                "licensePlate": license_plate_row,
                "destinationId": destination_id_row,
                "destinationName": destination_name_row,
                "vehicleCapacity": vehicle_capacity,
                "basePrice": base_price,
                "totalPrice": total_price,
                "staffName": staff_name.clone(),
                "staffId": created_by.clone(),
                "previousVehicle": prev_exit_row.map(|r| serde_json::json!({
                    "licensePlate": r.get::<_, String>("license_plate"),
                    "exitTime": r.get::<_, String>("current_exit_time")
                }))
            }));
        }
    } else {
        // Fallback: book from multiple vehicles if no single vehicle can accommodate all seats
        println!("🎫 [BOOKING DEBUG] No single vehicle can accommodate all {} seats, booking from multiple vehicles", seats_requested);
        
        for r in queue_rows.iter() {
            if remaining <= 0 { break; }
            let qid: String = r.get("id");
            let avail: i32 = r.get("available_seats");
            let take = remaining.min(avail);
            if take <= 0 { continue; }
            let base_price: f64 = r.get("base_price");
            let license_plate: String = r.get("license_plate");
            let queue_position: i32 = r.get("queue_position");
            
            println!("🎫 [BOOKING DEBUG] Booking {} seats from vehicle at position {} ({}: {})", take, queue_position, license_plate, qid);
            
            tx.execute("UPDATE vehicle_queue SET available_seats = available_seats - $1 WHERE id = $2", &[&take, &qid])
                .await.map_err(|e| e.to_string())?;

            // Check if this is the first booking on this vehicle (status is WAITING)
            let status_row = tx.query_opt(
                "SELECT status FROM vehicle_queue WHERE id = $1",
                &[&qid]
            ).await.map_err(|e| e.to_string())?;
            
            if let Some(row) = status_row {
                let current_status: String = row.get("status");
                if current_status == "WAITING" {
                    println!("🚌 [STATUS CHANGE] Changing vehicle {} from WAITING to LOADING (first booking)", license_plate);
                    tx.execute("UPDATE vehicle_queue SET status = 'LOADING' WHERE id = $1", &[&qid])
                        .await.map_err(|e| e.to_string())?;
                }
            }

            let bid = uuid::Uuid::new_v4().to_string();
            let verification_code = uuid::Uuid::new_v4().to_string();
            let base_amount = base_price * (take as f64);
            let service_fee = 0.200 * (take as f64); // Fixed 0.200 TND service fee per seat
            let amount = base_amount + service_fee;
            total_amount += amount;
            
            tx.execute(
                r#"INSERT INTO bookings (id, queue_id, seats_booked, total_amount, booking_source, booking_type, payment_status, payment_method, verification_code, created_offline, created_by, created_at)
                    VALUES ($1,$2,$3,$4,'CASH_STATION','CASH','PAID','CASH',$5,false,$6,NOW())"#,
                &[&bid, &qid, &take, &amount, &verification_code, &created_by]
            ).await.map_err(|e| e.to_string())?;

            // Get destination name and vehicle capacity for the booking
            let vehicle_info_row = tx.query_opt(
                "SELECT destination_name, v.capacity FROM vehicle_queue q JOIN vehicles v ON v.id = q.vehicle_id WHERE q.id = $1",
                &[&qid]
            ).await.map_err(|e| e.to_string())?;
            
            let (destination_name, vehicle_capacity) = if let Some(row) = vehicle_info_row {
                (
                    row.get::<_, String>("destination_name"),
                    row.get::<_, i32>("capacity")
                )
            } else {
                ("Unknown Destination".to_string(), 8)
            };

            bookings.push(serde_json::json!({
                "id": bid,
                "queueId": qid,
                "seatsBooked": take,
                "baseAmount": base_amount,
                "serviceFeeAmount": service_fee,
                "totalAmount": amount,
                "verificationCode": verification_code,
                "vehicleLicensePlate": license_plate,
                "destinationId": destination_id,
                "destinationName": destination_name,
                "vehicleCapacity": vehicle_capacity,
                "staffName": staff_name.clone(),
                "staffId": created_by.clone(),
            }));

            remaining -= take;

            // Check if this vehicle became fully booked and needs exit pass
            let row_after = tx.query_one(
                "SELECT q.available_seats, q.total_seats, q.destination_id, q.destination_name, q.vehicle_id, v.license_plate, v.capacity \
                 FROM vehicle_queue q JOIN vehicles v ON v.id = q.vehicle_id WHERE q.id = $1",
                &[&qid]
            ).await.map_err(|e| e.to_string())?;
            let avail_after: i32 = row_after.get("available_seats");
            if avail_after == 0 {
                // Update vehicle status to READY when fully booked
                println!("🚌 [STATUS CHANGE] Changing vehicle {} from LOADING to READY (fully booked)", license_plate);
                tx.execute("UPDATE vehicle_queue SET status = 'READY' WHERE id = $1", &[&qid])
                    .await.map_err(|e| e.to_string())?;
                
                let destination_id_row: String = row_after.get("destination_id");
                let destination_name_row: String = row_after.get("destination_name");
                let vehicle_id_row: String = row_after.get("vehicle_id");
                let license_plate_row: String = row_after.get("license_plate");
                let vehicle_capacity: i32 = row_after.get("capacity");

                // Get route base price for total calculation
                let route_row = tx.query_opt(
                    "SELECT base_price FROM routes WHERE station_id = $1",
                    &[&destination_id_row]
                ).await.map_err(|e| e.to_string())?;
                let base_price: f64 = route_row.map(|r| r.get::<_, f64>("base_price")).unwrap_or(0.0);
                let total_price = base_price * (vehicle_capacity as f64);

                // Get previous vehicle exit info for same destination today
                let prev_exit_row = tx.query_opt(
                    r#"SELECT license_plate, current_exit_time::text as current_exit_time
                       FROM exit_passes 
                       WHERE destination_id = $1 
                         AND (current_exit_time AT TIME ZONE 'Africa/Tunis')::date = (NOW() AT TIME ZONE 'Africa/Tunis')::date
                       ORDER BY current_exit_time DESC 
                       LIMIT 1"#,
                    &[&destination_id_row]
                ).await.map_err(|e| e.to_string())?;

                let exit_id = uuid::Uuid::new_v4().to_string();
                tx.execute(
                    r#"INSERT INTO exit_passes (
                            id, queue_id, vehicle_id, license_plate, destination_id, destination_name, current_exit_time, created_by, created_at
                        ) VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,NOW())"#,
                    &[&exit_id, &qid, &vehicle_id_row, &license_plate_row, &destination_id_row, &destination_name_row, &created_by]
                ).await.map_err(|e| e.to_string())?;

                // schedule print after commit with all required data
                exit_passes_to_print.push(serde_json::json!({
                    "id": exit_id,
                    "licensePlate": license_plate_row,
                    "destinationId": destination_id_row,
                    "destinationName": destination_name_row,
                    "vehicleCapacity": vehicle_capacity,
                    "basePrice": base_price,
                    "totalPrice": total_price,
                    "staffName": staff_name.clone(),
                    "staffId": created_by.clone(),
                    "previousVehicle": prev_exit_row.map(|r| serde_json::json!({
                        "licensePlate": r.get::<_, String>("license_plate"),
                        "exitTime": r.get::<_, String>("current_exit_time")
                    }))
                }));
            }
        }
    }

    if remaining > 0 {
        return Err("Not enough seats available".into());
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    // After commit: print exit passes and remove vehicles from queue
    if !exit_passes_to_print.is_empty() {
        println!("🎫 DEBUG: {} exit passes to print", exit_passes_to_print.len());
        let staff = created_by.clone();
        let items = exit_passes_to_print.clone();
        tauri::async_runtime::spawn(async move {
            println!("🎫 DEBUG: Starting exit pass printing task");
            // slight delay to ensure booking tickets are printed first
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            
            let printer = PRINTER_SERVICE.clone();
            let printer_clone = {
                let guard = printer.lock().unwrap();
                guard.clone()
            };
            
            // Get DB connection for vehicle removal
            let client = DB_POOL.get().await.unwrap();
            
            for item in items.into_iter() {
                let license_plate = item["licensePlate"].as_str().unwrap_or("").to_string();
                println!("🎫 DEBUG: Processing exit pass for vehicle: {}", license_plate);
                
                // Print exit pass ticket
                let ticket = serde_json::json!({
                    "ticketNumber": format!("EXIT-{}", chrono::Utc::now().timestamp_millis()),
                    "licensePlate": license_plate,
                    "stationName": item["destinationName"].as_str().unwrap_or(""),
                    "exitTime": chrono::Utc::now().to_rfc3339(),
                    "vehicleCapacity": item["vehicleCapacity"].as_i64().unwrap_or(8),
                    "basePrice": item["basePrice"].as_f64().unwrap_or(0.0),
                    "totalPrice": item["totalPrice"].as_f64().unwrap_or(0.0),
                    "previousVehicle": item["previousVehicle"]
                }).to_string();
                
                println!("🎫 DEBUG: Exit pass ticket data: {}", ticket);
                
                // Print the exit pass ticket
                match printer_clone.print_exit_pass_ticket(ticket, staff.clone()).await {
                    Ok(result) => println!("✅ Exit pass printed successfully: {}", result),
                    Err(e) => println!("❌ Exit pass printing failed: {}", e),
                }
                
                // Remove vehicle from queue after printing
                match client.execute(
                    "DELETE FROM vehicle_queue WHERE vehicle_id = (SELECT id FROM vehicles WHERE license_plate = $1)",
                    &[&license_plate]
                ).await {
                    Ok(rows_deleted) => println!("✅ Vehicle {} removed from queue ({} rows deleted)", license_plate, rows_deleted),
                    Err(e) => println!("❌ Failed to remove vehicle {} from queue: {}", license_plate, e),
                }
            }
            println!("🎫 DEBUG: Exit pass printing task completed");
        });
    }

    Ok(BookingCreatedDto { bookings, totalAmount: total_amount })
}

#[tauri::command]
async fn db_create_vehicle_specific_booking(queue_id: String, seats_requested: i32, created_by: Option<String>) -> Result<BookingCreatedDto, String> {
    if seats_requested <= 0 { return Err("seats_requested must be > 0".into()); }
    let mut client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let tx = client.build_transaction().start().await.map_err(|e| e.to_string())?;

    // Get the specific vehicle queue information
    let queue_row = tx.query_opt(
        r#"
        SELECT q.id, q.available_seats, q.total_seats, q.base_price, v.license_plate, q.queue_position, q.destination_id
        FROM vehicle_queue q
        JOIN vehicles v ON v.id = q.vehicle_id
        WHERE q.id = $1 AND q.available_seats > 0
        FOR UPDATE
        "#,
        &[&queue_id]
    ).await.map_err(|e| e.to_string())?;

    if queue_row.is_none() {
        return Err("Véhicule sélectionné non disponible ou pas assez de places".into());
    }

    let r = queue_row.unwrap();
    let qid: String = r.get("id");
    let available_seats: i32 = r.get("available_seats");
    let total_seats: i32 = r.get("total_seats");
    let base_price: f64 = r.get("base_price");
    let license_plate: String = r.get("license_plate");
    let queue_position: i32 = r.get("queue_position");
    let _destination_id: String = r.get("destination_id");

    println!("🎫 [VEHICLE BOOKING DEBUG] Booking {} seats from specific vehicle at position {} ({}: {})", seats_requested, queue_position, license_plate, qid);
    println!("🎫 [VEHICLE BOOKING DEBUG] Vehicle has {} available seats out of {} total", available_seats, total_seats);

    if available_seats < seats_requested {
        return Err(format!("Pas assez de places disponibles. Véhicule {} a seulement {} places disponibles, mais {} demandées", license_plate, available_seats, seats_requested));
    }

    let mut bookings: Vec<serde_json::Value> = Vec::new();
    let mut total_amount: f64 = 0.0;
    let mut exit_passes_to_print: Vec<serde_json::Value> = Vec::new();

    // Book all requested seats from this specific vehicle
    let take = seats_requested;
    
    tx.execute("UPDATE vehicle_queue SET available_seats = available_seats - $1 WHERE id = $2", &[&take, &qid])
        .await.map_err(|e| e.to_string())?;

    // Check if this is the first booking on this vehicle (status is WAITING)
    let status_row = tx.query_opt(
        "SELECT status FROM vehicle_queue WHERE id = $1",
        &[&qid]
    ).await.map_err(|e| e.to_string())?;
    
    if let Some(row) = status_row {
        let current_status: String = row.get("status");
        if current_status == "WAITING" {
            println!("🚌 [STATUS CHANGE] Changing vehicle {} from WAITING to LOADING (first booking)", license_plate);
            tx.execute("UPDATE vehicle_queue SET status = 'LOADING' WHERE id = $1", &[&qid])
                .await.map_err(|e| e.to_string())?;
        }
    }

    let bid = uuid::Uuid::new_v4().to_string();
    let verification_code = uuid::Uuid::new_v4().to_string();
    let base_amount = base_price * (take as f64);
    let service_fee = 0.200 * (take as f64); // Fixed 0.200 TND service fee per seat
    let amount = base_amount + service_fee;
    total_amount += amount;
    
    tx.execute(
        r#"INSERT INTO bookings (id, queue_id, seats_booked, total_amount, booking_source, booking_type, payment_status, payment_method, verification_code, created_offline, created_by, created_at)
            VALUES ($1,$2,$3,$4,'CASH_STATION','CASH','PAID','CASH',$5,false,$6,NOW())"#,
        &[&bid, &qid, &take, &amount, &verification_code, &created_by]
    ).await.map_err(|e| e.to_string())?;

    // Get destination name and vehicle capacity for the booking
    let vehicle_info_row = tx.query_opt(
        "SELECT destination_name, v.capacity FROM vehicle_queue q JOIN vehicles v ON v.id = q.vehicle_id WHERE q.id = $1",
        &[&qid]
    ).await.map_err(|e| e.to_string())?;
    
    let (destination_name, vehicle_capacity) = if let Some(row) = vehicle_info_row {
        let dest_name: String = row.get("destination_name");
        let capacity: i32 = row.get("capacity");
        (dest_name, capacity)
    } else {
        ("Unknown Destination".to_string(), total_seats)
    };

    let booking_data = serde_json::json!({
        "id": bid,
        "queueId": qid,
        "seatsBooked": take,
        "totalAmount": amount,
        "baseAmount": base_amount,
        "serviceFee": service_fee,
        "verificationCode": verification_code,
        "licensePlate": license_plate,
        "destinationName": destination_name,
        "vehicleCapacity": vehicle_capacity,
        "queuePosition": queue_position,
        "bookingSource": "CASH_STATION",
        "bookingType": "CASH",
        "paymentStatus": "PAID",
        "paymentMethod": "CASH",
        "createdBy": created_by,
        "createdAt": chrono::Utc::now().to_rfc3339()
    });

    bookings.push(booking_data);

    println!("🎫 [VEHICLE BOOKING DEBUG] Successfully booked {} seats from vehicle {} ({}: {})", take, license_plate, qid, bid);

    // Check if vehicle is now fully booked and needs exit pass
    let updated_seats_row = tx.query_one("SELECT available_seats FROM vehicle_queue WHERE id = $1", &[&qid])
        .await.map_err(|e| e.to_string())?;
    let remaining_seats: i32 = updated_seats_row.get("available_seats");

    if remaining_seats == 0 {
        println!("🎫 [VEHICLE BOOKING DEBUG] Vehicle {} is now fully booked, preparing exit pass", license_plate);
        
        let exit_pass_data = serde_json::json!({
            "licensePlate": license_plate,
            "destinationName": destination_name,
            "queuePosition": queue_position,
            "totalSeats": total_seats,
            "seatsBooked": take,
            "basePrice": base_price,
            "totalAmount": amount,
            "verificationCode": verification_code,
            "createdBy": created_by,
            "createdAt": chrono::Utc::now().to_rfc3339()
        });
        
        exit_passes_to_print.push(exit_pass_data);
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    // Handle exit pass printing asynchronously
    if !exit_passes_to_print.is_empty() {
        let exit_pass = exit_passes_to_print[0].clone();
        let license_plate = exit_pass["licensePlate"].as_str().unwrap_or("").to_string();
        let destination_name = exit_pass["destinationName"].as_str().unwrap_or("").to_string();
        
        tokio::spawn(async move {
            println!("🎫 [VEHICLE BOOKING DEBUG] Starting exit pass printing for vehicle {}", license_plate);
            if let Err(e) = print_entry_or_daypass_if_needed(license_plate.clone(), destination_name.clone(), 0.0, None).await {
                println!("❌ [VEHICLE BOOKING DEBUG] Exit pass printing failed for vehicle {}: {}", license_plate, e);
            } else {
                println!("✅ [VEHICLE BOOKING DEBUG] Exit pass printed successfully for vehicle {}", license_plate);
            }
            println!("🎫 [VEHICLE BOOKING DEBUG] Exit pass printing task completed");
        });
    }

    Ok(BookingCreatedDto { bookings, totalAmount: total_amount })
}

#[tauri::command]
async fn db_cancel_queue_booking(booking_id: String) -> Result<(), String> {
    let mut client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let tx = client.build_transaction().start().await.map_err(|e| e.to_string())?;
    let row = tx.query_one("SELECT queue_id, seats_booked FROM bookings WHERE id = $1", &[&booking_id])
        .await.map_err(|e| e.to_string())?;
    let qid: String = row.get("queue_id");
    let seats: i32 = row.get("seats_booked");
    tx.execute("UPDATE vehicle_queue SET available_seats = available_seats + $1 WHERE id = $2", &[&seats, &qid])
        .await.map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM bookings WHERE id = $1", &[&booking_id]).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn db_cancel_seat_from_destination(destination_id: String, created_by: Option<String>) -> Result<String, String> {
    let mut client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let tx = client.build_transaction().start().await.map_err(|e| e.to_string())?;
    
    // First, check if there are any vehicles in the queue for this destination
    let queue_exists = tx.query_opt(
        "SELECT COUNT(*) as count FROM vehicle_queue WHERE destination_id = $1",
        &[&destination_id]
    )
    .await.map_err(|e| e.to_string())?;
    
    let queue_count: i64 = queue_exists.map_or(0, |row| row.get("count"));
    if queue_count == 0 {
        tx.commit().await.map_err(|e| e.to_string())?;
        return Err("Accès refusé! Le véhicule n'est plus dans la file d'attente. Vous ne pouvez pas annuler cette réservation.".to_string());
    }
    
    // Find the most recent booking for this destination by the specific staff member
    let booking_query = if let Some(ref _staff_id) = created_by {
        // Find booking by specific staff member
        r#"
        SELECT b.id, b.queue_id, b.seats_booked, b.total_amount, b.verification_code, vq.destination_name, v.license_plate
        FROM bookings b
        JOIN vehicle_queue vq ON b.queue_id = vq.id
        JOIN vehicles v ON vq.vehicle_id = v.id
        WHERE vq.destination_id = $1 AND b.created_by = $2
        ORDER BY b.created_at DESC
        LIMIT 1
        "#
    } else {
        // Find any booking for this destination (fallback)
        r#"
        SELECT b.id, b.queue_id, b.seats_booked, b.total_amount, b.verification_code, vq.destination_name, v.license_plate
        FROM bookings b
        JOIN vehicle_queue vq ON b.queue_id = vq.id
        JOIN vehicles v ON vq.vehicle_id = v.id
        WHERE vq.destination_id = $1
        ORDER BY b.created_at DESC
        LIMIT 1
        "#
    };
    
    let booking_row = if let Some(ref staff_id) = created_by {
        tx.query_opt(booking_query, &[&destination_id, staff_id])
            .await.map_err(|e| e.to_string())?
    } else {
        tx.query_opt(booking_query, &[&destination_id])
            .await.map_err(|e| e.to_string())?
    };
    
    if let Some(row) = booking_row {
        let booking_id: String = row.get("id");
        let queue_id: String = row.get("queue_id");
        let seats_booked: i32 = row.get("seats_booked");
        let total_amount: f64 = row.get("total_amount");
        let verification_code: String = row.get("verification_code");
        let destination_name: String = row.get("destination_name");
        let license_plate: String = row.get("license_plate");
        
        // Check if the vehicle for this booking is still in the queue
        let vehicle_in_queue = tx.query_opt(
            "SELECT vq.id FROM vehicle_queue vq 
             JOIN vehicles v ON vq.vehicle_id = v.id 
             WHERE vq.id = $1 AND v.license_plate = $2",
            &[&queue_id, &license_plate]
        )
        .await.map_err(|e| e.to_string())?;
        
        if vehicle_in_queue.is_none() {
            tx.commit().await.map_err(|e| e.to_string())?;
            return Err("Accès refusé! Le véhicule de votre réservation n'est plus dans la file d'attente. Vous ne pouvez pas annuler cette réservation.".to_string());
        }
        
        if seats_booked > 1 {
            // Reduce seats by 1
            let new_seats = seats_booked - 1;
            let seat_price = total_amount / seats_booked as f64;
            let new_total = seat_price * new_seats as f64;
            
            tx.execute(
                "UPDATE bookings SET seats_booked = $1, total_amount = $2 WHERE id = $3",
                &[&new_seats, &new_total, &booking_id]
            )
            .await.map_err(|e| e.to_string())?;
            
            // Update available seats in the queue
            tx.execute(
                "UPDATE vehicle_queue SET available_seats = available_seats + 1 WHERE id = $1",
                &[&queue_id]
            )
            .await.map_err(|e| e.to_string())?;
            
            tx.commit().await.map_err(|e| e.to_string())?;
            Ok(format!("1 place annulée de la réservation {} pour {} (véhicule {})", verification_code, destination_name, license_plate))
        } else {
            // Cancel the entire booking if only 1 seat
            tx.execute("DELETE FROM bookings WHERE id = $1", &[&booking_id])
                .await.map_err(|e| e.to_string())?;
            
            // Update available seats in the queue
            tx.execute(
                "UPDATE vehicle_queue SET available_seats = available_seats + 1 WHERE id = $1",
                &[&queue_id]
            )
            .await.map_err(|e| e.to_string())?;
            
            tx.commit().await.map_err(|e| e.to_string())?;
            Ok(format!("Réservation {} annulée complètement pour {} (véhicule {})", verification_code, destination_name, license_plate))
        }
    } else {
        tx.commit().await.map_err(|e| e.to_string())?;
        Err("Aucune réservation trouvée pour cette destination par ce membre du personnel".to_string())
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct DiscoveredServer {
    ip: String,
    port: u16,
    url: String,
    response_time: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct NetworkDiscoveryResult {
    servers: Vec<DiscoveredServer>,
    total_scanned: u32,
    scan_duration_ms: u64,
}

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn get_app_name() -> String {
    env!("CARGO_PKG_NAME").to_string()
}

#[tauri::command]
fn get_network_info() -> Result<String, String> {
    use std::process::Command;
    
    let mut info = String::new();
    
    // Get IP route info
    if let Ok(output) = Command::new("ip")
        .args(&["route", "get", "8.8.8.8"])
        .output()
    {
        if output.status.success() {
            let output_str = String::from_utf8_lossy(&output.stdout);
            info.push_str("=== IP Route Info ===\n");
            info.push_str(&output_str);
            info.push_str("\n");
        }
    }
    
    // Get interface info
    if let Ok(output) = Command::new("ip")
        .args(&["addr", "show"])
        .output()
    {
        if output.status.success() {
            let output_str = String::from_utf8_lossy(&output.stdout);
            info.push_str("=== Interface Info ===\n");
            info.push_str(&output_str);
            info.push_str("\n");
        }
    }
    
    // Get detected local IP
    match get_local_ip() {
        Ok(ip) => {
            info.push_str(&format!("=== Detected Local IP ===\n{}\n", ip));
            info.push_str(&format!("=== Network Prefix ===\n{}\n", get_network_prefix(&ip)));
        }
        Err(e) => {
            info.push_str(&format!("=== Error getting local IP ===\n{}\n", e));
        }
    }
    
    Ok(info)
}

#[tauri::command]
async fn discover_local_servers() -> Result<NetworkDiscoveryResult, String> {
    let start_time = std::time::Instant::now();
    let mut discovered_servers = Vec::new();
    let mut total_scanned = 0u32;
    
    // Get local IP address
    let local_ip = get_local_ip().map_err(|e| format!("Failed to get local IP: {}", e))?;
    let network_prefix = get_network_prefix(&local_ip);
    
    println!("🌐 Starting network discovery on network: {}", network_prefix);
    println!("🔍 Detected local IP: {}", local_ip);
    
    // Create HTTP client with timeout
    let client = Client::builder()
        .timeout(Duration::from_millis(3000))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    // Define ports to scan (start with 3001, then 3002, 3003, etc.)
    let ports_to_scan = vec![3001, 3002, 3003, 3004, 3005, 3000, 3006, 3007, 3008, 3009];
    
    for port in ports_to_scan {
        println!("Scanning port {}...", port);
        
        // Scan the local network for this port
        let mut tasks = Vec::new();
        
        // Scan from 1 to 254 to cover the entire subnet
        for i in 1..=254 {
            let ip = format!("{}.{}", network_prefix, i);
            let client_clone = client.clone();
            let port_clone = port;
            
            let task = tokio::spawn(async move {
                scan_ip(&ip, port_clone, &client_clone).await
            });
            
            tasks.push(task);
        }
        
        println!("🔍 Scanning {} IPs on port {}...", 254, port);
        
        // Wait for all tasks to complete with a timeout
        let scan_timeout = Duration::from_secs(15); // Shorter timeout per port
        let results = timeout(scan_timeout, futures::future::join_all(tasks)).await
            .map_err(|_| format!("Network scan timed out for port {}", port))?;
        
        // Process results for this port
        for result in results {
            total_scanned += 1;
            if let Ok(inner) = result {
                if let Ok(Some(server)) = inner {
                    discovered_servers.push(server);
                }
            }
        }
        
        // If we found servers on this port, we can stop scanning additional ports
        if !discovered_servers.is_empty() {
            println!("Found {} servers on port {}, stopping scan", discovered_servers.len(), port);
            break;
        }
    }
    
    let scan_duration = start_time.elapsed().as_millis() as u64;
    
    // Sort by response time (fastest first)
    discovered_servers.sort_by(|a, b| a.response_time.cmp(&b.response_time));
    
    println!("Network discovery completed: found {} servers in {}ms", 
             discovered_servers.len(), scan_duration);
    
    Ok(NetworkDiscoveryResult {
        servers: discovered_servers,
        total_scanned,
        scan_duration_ms: scan_duration,
    })
}

#[tauri::command]
fn add_firewall_rule(exe_path: String, app_name: String) -> Result<(), String> {
    use std::process::Command;
    let rule_in = format!("netsh advfirewall firewall add rule name=\"{}\" dir=in action=allow program=\"{}\" enable=yes", app_name, exe_path);
    let rule_out = format!("netsh advfirewall firewall add rule name=\"{}\" dir=out action=allow program=\"{}\" enable=yes", app_name, exe_path);

    let status_in = Command::new("cmd")
        .args(&["/C", &rule_in])
        .status()
        .map_err(|e| e.to_string())?;
    let status_out = Command::new("cmd")
        .args(&["/C", &rule_out])
        .status()
        .map_err(|e| e.to_string())?;

    if status_in.success() && status_out.success() {
        Ok(())
    } else {
        Err("Failed to add firewall rule".to_string())
    }
}

#[tauri::command]
async fn proxy_localnode(
    method: String,
    endpoint: String,
    body: Option<String>,
    server_url: Option<String>,
    headers: Option<std::collections::HashMap<String, String>> // Accept headers from JS
) -> Result<String, String> {
    use reqwest::Client;
    use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
    
    let client = Client::new();
    
    let base_url = if let Some(url) = server_url {
        // Use provided server URL
        url
    } else {
        // Auto-discover the best server URL
        match discover_local_servers().await {
            Ok(discovery_result) => {
                if let Some(server) = discovery_result.servers.first() {
                    server.url.clone()
                } else {
                    "http://127.0.0.1:3001".to_string()
                }
            }
            Err(_) => {
                "http://127.0.0.1:3001".to_string()
            }
        }
    };
    
    let url = format!("{}{}", base_url, endpoint);

    let mut req = match method.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "PATCH" => client.patch(&url),
        "DELETE" => client.delete(&url),
        _ => return Err("Unsupported method".to_string()),
    };

    // Build headers
    let mut header_map = HeaderMap::new();
    header_map.insert(CONTENT_TYPE, "application/json".parse().unwrap());
    if let Some(hs) = headers {
        for (k, v) in hs.iter() {
            if let (Ok(name), Ok(value)) = (HeaderName::from_bytes(k.as_bytes()), HeaderValue::from_str(v)) {
                header_map.insert(name, value);
            }
        }
    }
    req = req.headers(header_map);

    let resp = if let Some(body) = body {
        req.body(body).send().await
    } else {
        req.send().await
    };

    match resp {
        Ok(r) => {
            let text = r.text().await.map_err(|e| e.to_string())?;
            Ok(text)
        }
        Err(e) => Err(e.to_string()),
    }
}

// WebSocket relay commands removed

#[tauri::command]
fn toggle_fullscreen(window: tauri::Window) -> Result<(), String> {
    let is_fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;
    window.set_fullscreen(!is_fullscreen).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn minimize_to_tray(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn show_window(window: tauri::Window) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn setup_auto_startup() -> Result<String, String> {
    let app_name = "Nqlix";
    let app_path = std::env::current_exe().map_err(|e| e.to_string())?;
    
    let auto = AutoLaunchBuilder::new()
        .set_app_name(app_name)
        .set_app_path(&app_path.to_string_lossy())
        .set_use_launch_agent(true)
        .build()
        .map_err(|e| e.to_string())?;
    
    if auto.is_enabled().map_err(|e| e.to_string())? {
        Ok("Auto-startup is already enabled".to_string())
    } else {
        auto.enable().map_err(|e| e.to_string())?;
        Ok("Auto-startup enabled successfully".to_string())
    }
}

#[tauri::command]
fn disable_auto_startup() -> Result<String, String> {
    let app_name = "Nqlix";
    let app_path = std::env::current_exe().map_err(|e| e.to_string())?;
    
    let auto = AutoLaunchBuilder::new()
        .set_app_name(app_name)
        .set_app_path(&app_path.to_string_lossy())
        .set_use_launch_agent(true)
        .build()
        .map_err(|e| e.to_string())?;
    
    if auto.is_enabled().map_err(|e| e.to_string())? {
        auto.disable().map_err(|e| e.to_string())?;
        Ok("Auto-startup disabled successfully".to_string())
    } else {
        Ok("Auto-startup was not enabled".to_string())
    }
}

#[tauri::command]
fn check_auto_startup() -> Result<bool, String> {
    let app_name = "Nqlix";
    let app_path = std::env::current_exe().map_err(|e| e.to_string())?;
    
    let auto = AutoLaunchBuilder::new()
        .set_app_name(app_name)
        .set_app_path(&app_path.to_string_lossy())
        .set_use_launch_agent(true)
        .build()
        .map_err(|e| e.to_string())?;
    
    auto.is_enabled().map_err(|e| e.to_string())
}

// Printer commands
#[tauri::command]
async fn get_all_printers() -> Result<Vec<PrinterConfig>, String> {
    let printer = PRINTER_SERVICE.lock().map_err(|e| e.to_string())?;
    printer.get_all_printers()
}

#[tauri::command]
async fn get_printer_by_id(printer_id: String) -> Result<Option<PrinterConfig>, String> {
    let printer = PRINTER_SERVICE.lock().map_err(|e| e.to_string())?;
    printer.get_printer_by_id(&printer_id)
}

#[tauri::command]
async fn get_current_printer() -> Result<Option<PrinterConfig>, String> {
    let printer = PRINTER_SERVICE.lock().map_err(|e| e.to_string())?;
    // Return the current configuration without reloading from environment
    printer.get_current_printer()
}

#[tauri::command]
async fn reload_printer_env() -> Result<Option<PrinterConfig>, String> {
    let printer = PRINTER_SERVICE.lock().map_err(|e| e.to_string())?;
    printer.reload_config_from_env()?;
    printer.get_current_printer()
}

#[tauri::command]
async fn get_printer_env_snapshot() -> Result<String, String> {
    let printer = PRINTER_SERVICE.lock().map_err(|e| e.to_string())?;
    let snapshot = printer.debug_env_snapshot();
    serde_json::to_string_pretty(&snapshot).map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_current_printer(printer_id: String) -> Result<(), String> {
    let printer = PRINTER_SERVICE.lock().map_err(|e| e.to_string())?;
    printer.set_current_printer(&printer_id)
}

#[tauri::command]
async fn update_printer_config(printer_id: String, config: PrinterConfig) -> Result<(), String> {
    let printer = PRINTER_SERVICE.lock().map_err(|e| e.to_string())?;
    printer.update_printer_config(&printer_id, config)
}

#[tauri::command]
async fn add_printer(printer: PrinterConfig) -> Result<(), String> {
    let printer_service = PRINTER_SERVICE.lock().map_err(|e| e.to_string())?;
    printer_service.add_printer(printer)
}

#[tauri::command]
async fn remove_printer(printer_id: String) -> Result<(), String> {
    let printer = PRINTER_SERVICE.lock().map_err(|e| e.to_string())?;
    printer.remove_printer(&printer_id)
}

#[tauri::command]
async fn test_printer_connection_by_id(printer_id: String) -> Result<PrinterStatus, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.test_printer_connection(&printer_id).await
}

#[tauri::command]
async fn auto_set_default_printer() -> Result<(), String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    }; // printer_guard is automatically dropped here
    printer_clone.auto_set_default_printer().await
}

#[tauri::command]
async fn test_printer_connection() -> Result<PrinterStatus, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    }; // printer_guard is automatically dropped here
    printer_clone.test_connection().await
}

#[tauri::command]
async fn print_ticket(content: String) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_ticket(content).await
}

#[tauri::command]
async fn print_receipt(content: String) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_receipt(content).await
}


#[tauri::command]
async fn print_qr_code(data: String) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_qr_code(data).await
}

#[tauri::command]
async fn execute_print_job(job: PrintJob) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.execute_print_job(job).await
}

#[tauri::command]
async fn print_with_logo(content: String, logo_path: String) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_with_logo(content, logo_path).await
}

#[tauri::command]
async fn print_standard_ticket(content: String) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_standard_ticket(content).await
}

#[tauri::command]
async fn print_booking_ticket(ticket_data: String, staff_name: Option<String>) -> Result<String, String> {
    println!("🎫 [BOOKING DEBUG] Starting booking ticket print with database record creation...");
    println!("🎫 [BOOKING DEBUG] Ticket data: {}", ticket_data);
    
    // Try to parse as JSON first, if that fails, treat as plain text
    let booking_data: serde_json::Value = match serde_json::from_str(&ticket_data) {
        Ok(data) => {
            println!("🎫 [BOOKING DEBUG] Parsed as JSON data");
            data
        },
        Err(_) => {
            println!("🎫 [BOOKING DEBUG] Not JSON format, treating as plain text - skipping database record creation");
            // For plain text format, just print the ticket without creating database record
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
            
            println!("🎫 [BOOKING DEBUG] Printing plain text booking ticket...");
            let print_result = printer_clone.print_booking_ticket(ticket_data, staff_name).await;
            
            match print_result {
                Ok(result) => {
                    println!("✅ [BOOKING DEBUG] Plain text booking ticket printed successfully: {}", result);
                    return Ok("Plain text booking ticket printed successfully".to_string());
                },
                Err(e) => {
                    println!("❌ [BOOKING DEBUG] Plain text booking ticket print failed: {}", e);
                    return Err(format!("Plain text booking ticket print failed: {}", e));
                }
            }
        }
    };
    
    // Extract booking information from JSON
    let queue_id = booking_data["queueId"].as_str().unwrap_or("");
    let seats_booked = booking_data["seatsBooked"].as_i64().unwrap_or(1) as i32;
    let total_amount = booking_data["totalAmount"].as_f64().unwrap_or(0.0);
    let verification_code = booking_data["verificationCode"].as_str().unwrap_or("");
    
    // Use staff name from JSON data if available, otherwise use provided staff_name parameter
    let final_staff_name = booking_data["staffName"].as_str()
        .or_else(|| staff_name.as_ref().map(|s| s.as_str()))
        .unwrap_or("Staff");
    
    let created_by = booking_data["staffId"].as_str()
        .or_else(|| staff_name.as_ref().map(|s| s.as_str()))
        .unwrap_or("SYSTEM");
    
    println!("🎫 [BOOKING DEBUG] Extracted data - Queue ID: {}, Seats: {}, Amount: {}, Code: {}, Staff: {}", 
             queue_id, seats_booked, total_amount, verification_code, created_by);
    
    // Only create database record if we have valid queue_id
    if !queue_id.is_empty() {
        let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
        let booking_id = uuid::Uuid::new_v4().to_string();
        
        println!("🎫 [BOOKING DEBUG] Creating booking record with ID: {}", booking_id);
        
        let booking_result = client.execute(
            r#"INSERT INTO bookings (
                id, queue_id, seats_booked, total_amount, 
                booking_source, booking_type, payment_status, 
                payment_method, verification_code, created_offline, 
                created_by, created_at
            ) VALUES ($1, $2, $3, $4, 'CASH_STATION', 'CASH', 'PAID', 'CASH', $5, false, $6, NOW())"#,
            &[&booking_id, &queue_id, &seats_booked, &total_amount, &verification_code, &created_by]
        ).await;
        
        match booking_result {
            Ok(rows_inserted) => {
                println!("✅ [BOOKING DEBUG] Booking record created successfully: {} rows inserted", rows_inserted);
            },
            Err(e) => {
                println!("❌ [BOOKING DEBUG] Failed to create booking record: {}", e);
                return Err(format!("Failed to create booking record: {}", e));
            }
        }
    } else {
        println!("⚠️ [BOOKING DEBUG] No queue_id found, skipping database record creation");
    }
    
    // Now print the ticket
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    
    println!("🎫 [BOOKING DEBUG] Printing booking ticket...");
    let print_result = printer_clone.print_booking_ticket(ticket_data, Some(final_staff_name.to_string())).await;
    
    match print_result {
        Ok(result) => {
            println!("✅ [BOOKING DEBUG] Booking ticket printed successfully: {}", result);
            Ok("Booking ticket printed successfully".to_string())
        },
        Err(e) => {
            println!("❌ [BOOKING DEBUG] Booking ticket print failed: {}", e);
            Err(format!("Booking ticket print failed: {}", e))
        }
    }
}

#[tauri::command]
async fn db_end_trip_with_partial_capacity(queue_id: String, created_by: Option<String>) -> Result<String, String> {
    println!("🚗 [END TRIP DEBUG] Ending trip with partial capacity for queue ID: {}", queue_id);
    println!("🚗 [END TRIP DEBUG] Staff ID: {:?}", created_by);
    
    // Use provided staff ID or fallback to a default staff ID
    let staff_id = created_by.clone().unwrap_or_else(|| {
        // Use the first available staff ID as fallback
        "staff_1758836658054_rndmmig5s".to_string() // This is the "Supervisor Test" staff ID from the database
    });
    
    println!("🚗 [END TRIP DEBUG] Using staff ID: {}", staff_id);
    
    let mut client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    
    // Fetch staff name for display
    let staff_name = if let Some(staff_id) = &created_by {
        let staff_row = client.query_opt(
            "SELECT first_name, last_name FROM staff WHERE id = $1",
            &[staff_id]
        ).await.map_err(|e| e.to_string())?;
        
        if let Some(row) = staff_row {
            let first_name: String = row.get("first_name");
            let last_name: String = row.get("last_name");
            Some(format!("{} {}", first_name, last_name))
        } else {
            Some("Unknown Staff".to_string())
        }
    } else {
        Some("System".to_string())
    };
    
    println!("🚗 [END TRIP DEBUG] Staff name for display: {:?}", staff_name);
    let tx = client.build_transaction().start().await.map_err(|e| e.to_string())?;

    // Get vehicle and booking information
    let vehicle_info = tx.query_opt(
        r#"
        SELECT 
            q.id, q.vehicle_id, q.destination_id, q.destination_name, q.available_seats, q.total_seats, q.base_price,
            v.license_plate, v.capacity,
            COUNT(b.id) as booked_seats
        FROM vehicle_queue q
        JOIN vehicles v ON v.id = q.vehicle_id
        LEFT JOIN bookings b ON b.queue_id = q.id
        WHERE q.id = $1
        GROUP BY q.id, q.vehicle_id, q.destination_id, q.destination_name, q.available_seats, q.total_seats, q.base_price, v.license_plate, v.capacity
        "#,
        &[&queue_id]
    ).await.map_err(|e| e.to_string())?;

    let row = vehicle_info.ok_or("Vehicle not found in queue")?;
    let vehicle_id: String = row.get("vehicle_id");
    let destination_id: String = row.get("destination_id");
    let destination_name: String = row.get("destination_name");
    let license_plate: String = row.get("license_plate");
    let total_seats: i32 = row.get("total_seats");
    let available_seats: i32 = row.get("available_seats");
    let base_price: f64 = row.get("base_price");
    let booked_seats: i64 = row.get("booked_seats");
    
    println!("🚗 [END TRIP DEBUG] Vehicle: {} | Total seats: {} | Available: {} | Booked: {}", 
             license_plate, total_seats, available_seats, booked_seats);

    // Calculate the actual capacity used (total - available)
    let actual_capacity_used = total_seats - available_seats;
    let total_price = base_price * (actual_capacity_used as f64);
    
    println!("🚗 [END TRIP DEBUG] Actual capacity used: {} | Total price: {} TND", actual_capacity_used, total_price);

    // Get previous vehicle exit info for same destination today
    let prev_exit_row = tx.query_opt(
        r#"SELECT license_plate, current_exit_time::text as current_exit_time
           FROM exit_passes 
           WHERE destination_id = $1 
             AND (current_exit_time AT TIME ZONE 'Africa/Tunis')::date = (NOW() AT TIME ZONE 'Africa/Tunis')::date
           ORDER BY current_exit_time DESC 
           LIMIT 1"#,
        &[&destination_id]
    ).await.map_err(|e| e.to_string())?;

    // Create exit pass
    let exit_id = uuid::Uuid::new_v4().to_string();
    println!("🚗 [END TRIP DEBUG] Creating exit pass with ID: {}", exit_id);
    
    tx.execute(
        r#"INSERT INTO exit_passes (
                id, queue_id, vehicle_id, license_plate, destination_id, destination_name, current_exit_time, created_by, created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,NOW())"#,
        &[&exit_id, &queue_id, &vehicle_id, &license_plate, &destination_id, &destination_name, &staff_id]
    ).await.map_err(|e| {
        println!("❌ [END TRIP DEBUG] Failed to create exit pass: {}", e);
        e.to_string()
    })?;

    println!("✅ [END TRIP DEBUG] Exit pass created successfully");

    // Remove vehicle from queue
    println!("🚗 [END TRIP DEBUG] Removing vehicle from queue...");
    tx.execute("DELETE FROM vehicle_queue WHERE id = $1", &[&queue_id])
        .await.map_err(|e| {
            println!("❌ [END TRIP DEBUG] Failed to remove vehicle from queue: {}", e);
            e.to_string()
        })?;

    println!("✅ [END TRIP DEBUG] Vehicle removed from queue");

    println!("🚗 [END TRIP DEBUG] Committing transaction...");
    tx.commit().await.map_err(|e| {
        println!("❌ [END TRIP DEBUG] Failed to commit transaction: {}", e);
        e.to_string()
    })?;

    println!("✅ [END TRIP DEBUG] Transaction committed successfully");

    // Prepare exit pass data for printing
    let _exit_pass_data = serde_json::json!({
        "licensePlate": license_plate,
        "destinationName": destination_name,
        "vehicleCapacity": actual_capacity_used,
        "basePrice": base_price,
        "totalPrice": total_price,
        "bookedSeats": booked_seats,
        "previousVehicle": prev_exit_row.clone().map(|r| serde_json::json!({
            "licensePlate": r.get::<_, String>("license_plate"),
            "exitTime": r.get::<_, String>("current_exit_time")
        }))
    });

    // Print exit pass
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };

    let exit_pass_ticket = serde_json::json!({
        "ticketNumber": format!("EXIT-{}", chrono::Utc::now().timestamp_millis()),
        "licensePlate": license_plate,
        "stationName": destination_name,
        "exitTime": chrono::Utc::now().to_rfc3339(),
        "vehicleCapacity": actual_capacity_used,
        "basePrice": base_price,
        "totalPrice": total_price,
        "bookedSeats": booked_seats,
        "previousVehicle": prev_exit_row.clone().map(|r| serde_json::json!({
            "licensePlate": r.get::<_, String>("license_plate"),
            "exitTime": r.get::<_, String>("current_exit_time")
        }))
    }).to_string();

    println!("🚗 [END TRIP DEBUG] Printing exit pass for vehicle: {} with {} seats at {} TND", 
             license_plate, actual_capacity_used, total_price);

    match printer_clone.print_exit_pass_ticket(exit_pass_ticket, staff_name).await {
        Ok(result) => {
            println!("✅ [END TRIP DEBUG] Exit pass printed successfully for vehicle: {} - Result: {}", license_plate, result);
            Ok(format!("Trip ended successfully. Vehicle {} left with {} seats. Total amount: {} TND", 
                      license_plate, actual_capacity_used, total_price))
        },
        Err(e) => {
            println!("❌ [END TRIP DEBUG] Failed to print exit pass: {}", e);
            Err(format!("Trip ended but exit pass printing failed: {}", e))
        }
    }
}

#[tauri::command]
async fn db_update_queue_positions(destination_id: String, vehicle_positions: Vec<(String, i32)>) -> Result<String, String> {
    println!("🔄 [QUEUE REORDER DEBUG] Updating queue positions for destination: {}", destination_id);
    println!("🔄 [QUEUE REORDER DEBUG] Vehicle positions: {:?}", vehicle_positions);
    
    // First, let's check if the destination exists and what vehicles are in it
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    
    // Check if destination exists
    let dest_check = client.query_opt(
        "SELECT id, destination_name FROM vehicle_queue WHERE destination_id = $1 LIMIT 1",
        &[&destination_id]
    ).await.map_err(|e| {
        println!("❌ [QUEUE REORDER DEBUG] Failed to check destination: {}", e);
        e.to_string()
    })?;
    
    if dest_check.is_none() {
        println!("❌ [QUEUE REORDER DEBUG] No vehicles found for destination ID: {}", destination_id);
        return Err(format!("No vehicles found for destination ID: {}", destination_id));
    }
    
    let dest_row = dest_check.unwrap();
    let dest_name: String = dest_row.get("destination_name");
    println!("✅ [QUEUE REORDER DEBUG] Found destination: {} ({})", dest_name, destination_id);
    
    // Update each vehicle's queue position (without transaction for now)
    for (queue_id, new_position) in vehicle_positions {
        println!("🔄 [QUEUE REORDER DEBUG] Updating queue {} to position {} for destination {}", queue_id, new_position, destination_id);
        
        let result = client.execute(
            "UPDATE vehicle_queue SET queue_position = $1 WHERE id = $2 AND destination_id = $3",
            &[&new_position, &queue_id, &destination_id]
        ).await.map_err(|e| {
            println!("❌ [QUEUE REORDER DEBUG] Failed to update position for queue {}: {}", queue_id, e);
            e.to_string()
        })?;
        
        println!("🔄 [QUEUE REORDER DEBUG] Updated {} rows for queue {}", result, queue_id);
    }

    println!("✅ [QUEUE REORDER DEBUG] Queue positions updated successfully");
    Ok("Queue positions updated successfully".to_string())
}

#[tauri::command]
async fn db_move_vehicle_to_front(queue_id: String, destination_id: String) -> Result<String, String> {
    println!("🚀 [MOVE TO FRONT DEBUG] Moving vehicle to front - Queue ID: {}, Destination: {}", queue_id, destination_id);
    
    let mut client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let tx = client.build_transaction().start().await.map_err(|e| e.to_string())?;

    // Get current max position for this destination
    let max_position_row = tx.query_opt(
        "SELECT MAX(queue_position) as max_pos FROM vehicle_queue WHERE destination_id = $1",
        &[&destination_id]
    ).await.map_err(|e| e.to_string())?;

    let max_position: i32 = max_position_row
        .map(|row| row.get::<_, Option<i32>>("max_pos").unwrap_or(0))
        .unwrap_or(0);

    let new_position = max_position + 1;
    println!("🚀 [MOVE TO FRONT DEBUG] New position will be: {}", new_position);

    // Update the vehicle's position
    tx.execute(
        "UPDATE vehicle_queue SET queue_position = $1 WHERE id = $2",
        &[&new_position, &queue_id]
    ).await.map_err(|e| {
        println!("❌ [MOVE TO FRONT DEBUG] Failed to update position: {}", e);
        e.to_string()
    })?;

    tx.commit().await.map_err(|e| {
        println!("❌ [MOVE TO FRONT DEBUG] Failed to commit transaction: {}", e);
        e.to_string()
    })?;

    println!("✅ [MOVE TO FRONT DEBUG] Vehicle moved to front successfully");
    Ok("Vehicle moved to front successfully".to_string())
}

// =============== ENHANCED QUEUE MANAGEMENT COMMANDS ===============

#[derive(Debug, Serialize, Deserialize)]
struct VehicleDto {
    id: String,
    licensePlate: String,
    capacity: i32,
    isActive: bool,
    isAvailable: bool,
    isBanned: bool,
    phoneNumber: Option<String>,
    defaultDestinationId: Option<String>,
    defaultDestinationName: Option<String>,
    createdAt: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DestinationDto {
    stationId: String,
    stationName: String,
    basePrice: f64,
    governorate: Option<String>,
    delegation: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct VehicleInfo {
    id: String,
    licensePlate: String,
    capacity: i32,
    isActive: bool,
    isAvailable: bool,
    isBanned: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct TripInfo {
    id: String,
    destinationId: String,
    destinationName: String,
    queuePosition: i32,
    availableSeats: i32,
    totalSeats: i32,
    basePrice: f64,
    enteredAt: String,
    createdAt: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct DestinationSummary {
    destinationName: String,
    tripCount: i32,
    totalSeatsSold: i32,
    totalIncome: f64,
}

#[derive(Debug, Serialize, Deserialize)]
struct VehicleDailyReport {
    vehicle: VehicleInfo,
    date: String,
    trips: Vec<TripInfo>,
    totalTrips: i32,
    totalIncome: f64,
    totalSeatsSold: i32,
    destinations: Vec<DestinationSummary>,
}

#[derive(Debug, Serialize, Deserialize)]
struct VehicleReport {
    vehicle: VehicleInfo,
    totalTrips: i32,
    totalIncome: f64,
    totalSeatsSold: i32,
    trips: Vec<TripInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
struct AllVehiclesDailyReport {
    date: String,
    vehicles: Vec<VehicleReport>,
    totalVehicles: i32,
    totalTrips: i32,
    totalIncome: f64,
    totalSeatsSold: i32,
}

#[derive(Debug, Serialize, Deserialize)]
struct VehicleQueueStatusDto {
    id: String,
    vehicleId: String,
    licensePlate: String,
    destinationId: String,
    destinationName: String,
    queuePosition: i32,
    status: String,
    availableSeats: i32,
    totalSeats: i32,
    basePrice: f64,
    enteredAt: String,
}

#[tauri::command]
async fn db_get_all_vehicles() -> Result<Vec<VehicleDto>, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let sql = r#"
        SELECT id, license_plate, capacity, is_active, is_available, is_banned, phone_number,
               default_destination_id, default_destination_name, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
        FROM vehicles
        WHERE is_active = true
        ORDER BY created_at DESC
    "#;
    let rows = client.query(sql, &[]).await.map_err(|e| e.to_string())?;
    let vehicles = rows.into_iter().map(|r| VehicleDto {
        id: r.get("id"),
        licensePlate: r.get("license_plate"),
        capacity: r.get("capacity"),
        isActive: r.get("is_active"),
        isAvailable: r.get("is_available"),
        isBanned: r.get("is_banned"),
        phoneNumber: r.get("phone_number"),
        defaultDestinationId: r.get("default_destination_id"),
        defaultDestinationName: r.get("default_destination_name"),
        createdAt: r.get("created_at"),
    }).collect();
    Ok(vehicles)
}

#[tauri::command]
async fn db_get_available_destinations() -> Result<Vec<DestinationDto>, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let sql = r#"
        SELECT station_id, station_name, base_price, governorate, delegation
        FROM routes
        WHERE is_active = true
        ORDER BY station_name
    "#;
    let rows = client.query(sql, &[]).await.map_err(|e| e.to_string())?;
    let destinations = rows.into_iter().map(|r| DestinationDto {
        stationId: r.get("station_id"),
        stationName: r.get("station_name"),
        basePrice: r.get("base_price"),
        governorate: r.get("governorate"),
        delegation: r.get("delegation"),
    }).collect();
    Ok(destinations)
}

#[tauri::command]
async fn db_get_stations_by_governorate(governorate: String) -> Result<Vec<DestinationDto>, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let sql = r#"
        SELECT station_id, station_name, base_price, governorate, delegation
        FROM routes
        WHERE is_active = true AND LOWER(governorate) = LOWER($1)
        ORDER BY station_name
    "#;
    let rows = client.query(sql, &[&governorate]).await.map_err(|e| e.to_string())?;
    let destinations = rows.into_iter().map(|r| DestinationDto {
        stationId: r.get("station_id"),
        stationName: r.get("station_name"),
        basePrice: r.get("base_price"),
        governorate: r.get("governorate"),
        delegation: r.get("delegation"),
    }).collect();
    Ok(destinations)
}

#[tauri::command]
async fn db_create_vehicle(license_plate: String, capacity: i32, phone_number: Option<String>) -> Result<String, String> {
    let mut client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let tx = client.build_transaction().start().await.map_err(|e| e.to_string())?;

    // Check if vehicle already exists
    let existing_vehicle = tx.query_opt(
        "SELECT id FROM vehicles WHERE license_plate = $1",
        &[&license_plate]
    ).await.map_err(|e| e.to_string())?;
    
    if existing_vehicle.is_some() {
        return Err(format!("Véhicule avec la plaque {} existe déjà", license_plate));
    }

    // Create new vehicle
    let vehicle_id = uuid::Uuid::new_v4().to_string();
    // Insert with optional phone number if the column exists
    let insert_sql = "INSERT INTO vehicles (id, license_plate, capacity, phone_number, is_active, is_available, is_banned, created_at, updated_at) VALUES ($1, $2, $3, $4, true, true, false, NOW(), NOW())";
    tx.execute(
        insert_sql,
        &[&vehicle_id, &license_plate, &capacity, &phone_number]
    ).await.map_err(|e| format!("Erreur lors de la création du véhicule: {}", e))?;

    tx.commit().await.map_err(|e| e.to_string())?;
    
    Ok(format!("Véhicule {} créé avec succès (ID: {})", license_plate, vehicle_id))
}

// Update vehicle phone number by vehicle ID
#[tauri::command]
async fn db_update_vehicle_phone(vehicle_id: String, phone_number: Option<String>) -> Result<String, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let rows_affected = client
        .execute(
            "UPDATE vehicles SET phone_number = $1, updated_at = NOW() WHERE id = $2",
            &[&phone_number, &vehicle_id],
        )
        .await
        .map_err(|e| format!("Failed to update phone number: {}", e))?;
    if rows_affected == 0 {
        return Err("Vehicle not found".to_string());
    }
    Ok("Phone number updated".to_string())
}

#[derive(Debug, Serialize, Deserialize)]
struct VehicleActivityItem {
    eventType: String, // ENTRY or EXIT
    timestamp: String,
    destinationName: Option<String>,
}

#[tauri::command]
async fn db_get_vehicle_activity_72h(license_plate: String) -> Result<Vec<VehicleActivityItem>, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    // Use Tunis time window last 72 hours
    let rows = client.query(
        r#"
        SELECT 'ENTRY' AS event_type,
               to_char((purchase_date AT TIME ZONE 'Africa/Tunis'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ts,
               COALESCE(
                   (SELECT vq.destination_name FROM vehicle_queue vq 
                    JOIN vehicles v ON vq.vehicle_id = v.id
                    WHERE v.license_plate = dp.license_plate 
                    ORDER BY vq.entered_at DESC LIMIT 1),
                   'Destination inconnue'
               ) AS destination_name
        FROM day_passes dp
        WHERE dp.license_plate = $1
          AND (dp.purchase_date AT TIME ZONE 'Africa/Tunis') >= (NOW() AT TIME ZONE 'Africa/Tunis') - INTERVAL '72 hours'
        UNION ALL
        SELECT 'EXIT' AS event_type,
               to_char((current_exit_time AT TIME ZONE 'Africa/Tunis'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ts,
               destination_name
        FROM exit_passes
        WHERE license_plate = $1
          AND (current_exit_time AT TIME ZONE 'Africa/Tunis') >= (NOW() AT TIME ZONE 'Africa/Tunis') - INTERVAL '72 hours'
        ORDER BY ts DESC
        "#,
        &[&license_plate]
    ).await.map_err(|e| e.to_string())?;

    let mut items = Vec::with_capacity(rows.len());
    for r in rows.into_iter() {
        let ts: String = r.get("ts");
        items.push(VehicleActivityItem {
            eventType: r.get::<_, String>("event_type"),
            timestamp: ts,
            destinationName: r.get::<_, Option<String>>("destination_name"),
        });
    }
    Ok(items)
}

#[tauri::command]
async fn open_vehicle_window(app_handle: tauri::AppHandle, license_plate: String) -> Result<(), String> {
    let label = format!("vehicle-{}", license_plate);
    // Use hash route to avoid dev-server paths; adjust if using BrowserRouter
    let url = WindowUrl::App(format!("index.html#/vehicle-details?plate={}", license_plate).into());
    if app_handle.get_window(&label).is_none() {
        WindowBuilder::new(&app_handle, label, url)
            .title(format!("Véhicule {}", license_plate))
            .inner_size(980.0, 720.0)
            .resizable(true)
            .build()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn db_authorize_vehicle_station(vehicle_id: String, station_id: String, station_name: String) -> Result<String, String> {
    let mut client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let tx = client.build_transaction().start().await.map_err(|e| e.to_string())?;

    // Check if authorization already exists
    let existing_auth = tx.query_opt(
        "SELECT id FROM vehicle_authorized_stations WHERE vehicle_id = $1 AND station_id = $2",
        &[&vehicle_id, &station_id]
    ).await.map_err(|e| e.to_string())?;
    
    if existing_auth.is_some() {
        return Err(format!("Autorisation déjà existante pour cette station"));
    }

    // Create authorization
    let auth_id = uuid::Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO vehicle_authorized_stations (id, vehicle_id, station_id, station_name, priority, is_default, created_at) VALUES ($1, $2, $3, $4, 1, false, NOW())",
        &[&auth_id, &vehicle_id, &station_id, &station_name]
    ).await.map_err(|e| format!("Erreur lors de l'autorisation: {}", e))?;

    tx.commit().await.map_err(|e| e.to_string())?;
    
    Ok(format!("Autorisation créée pour la station {}", station_name))
}

// Enhanced printer commands with fallback methods
#[tauri::command]
async fn print_ticket_tcp(content: String, ip: String, port: u16) -> Result<String, String> {
    use std::net::TcpStream;
    use std::io::Write;
    
    match TcpStream::connect(format!("{}:{}", ip, port)) {
        Ok(mut stream) => {
            // Convert content to bytes and send
            let bytes = content.as_bytes();
            match stream.write_all(bytes) {
                Ok(_) => {
                    // Send cut command
                    let cut_command = vec![0x1D, 0x56, 0x00]; // ESC/POS cut command
                    let _ = stream.write_all(&cut_command);
                    Ok(format!("Ticket printed successfully via TCP to {}:{}", ip, port))
                }
                Err(e) => Err(format!("Failed to write to printer: {}", e))
            }
        }
        Err(e) => Err(format!("Failed to connect to printer at {}:{} - {}", ip, port, e))
    }
}

#[tauri::command]
async fn print_ticket_raw(content: String, ip: String, port: u16) -> Result<String, String> {
    use std::io::Write;
    
    // Try with a longer timeout
    match std::net::TcpStream::connect_timeout(
        &format!("{}:{}", ip, port).parse().unwrap(),
        std::time::Duration::from_secs(10)
    ) {
        Ok(mut stream) => {
            // Set socket options for better reliability
            let _ = stream.set_nodelay(true);
            let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
            let _ = stream.set_write_timeout(Some(std::time::Duration::from_secs(5)));
            
            // Send raw content
            let bytes = content.as_bytes();
            match stream.write_all(bytes) {
                Ok(_) => {
                    // Send cut command
                    let cut_command = vec![0x1D, 0x56, 0x00]; // ESC/POS cut command
                    let _ = stream.write_all(&cut_command);
                    Ok(format!("Ticket printed successfully via raw socket to {}:{}", ip, port))
                }
                Err(e) => Err(format!("Failed to write to printer: {}", e))
            }
        }
        Err(e) => Err(format!("Failed to connect to printer at {}:{} - {}", ip, port, e))
    }
}

#[tauri::command]
async fn print_receipt_tcp(content: String, ip: String, port: u16) -> Result<String, String> {
    use std::net::TcpStream;
    use std::io::Write;
    
    match TcpStream::connect(format!("{}:{}", ip, port)) {
        Ok(mut stream) => {
            // Convert content to bytes and send
            let bytes = content.as_bytes();
            match stream.write_all(bytes) {
                Ok(_) => {
                    // Send cut command
                    let cut_command = vec![0x1D, 0x56, 0x00]; // ESC/POS cut command
                    let _ = stream.write_all(&cut_command);
                    Ok(format!("Receipt printed successfully via TCP to {}:{}", ip, port))
                }
                Err(e) => Err(format!("Failed to write to printer: {}", e))
            }
        }
        Err(e) => Err(format!("Failed to connect to printer at {}:{} - {}", ip, port, e))
    }
}

#[tauri::command]
async fn print_receipt_raw(content: String, ip: String, port: u16) -> Result<String, String> {
    use std::io::Write;
    
    // Try with a longer timeout
    match std::net::TcpStream::connect_timeout(
        &format!("{}:{}", ip, port).parse().unwrap(),
        std::time::Duration::from_secs(10)
    ) {
        Ok(mut stream) => {
            // Set socket options for better reliability
            let _ = stream.set_nodelay(true);
            let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
            let _ = stream.set_write_timeout(Some(std::time::Duration::from_secs(5)));
            
            // Send raw content
            let bytes = content.as_bytes();
            match stream.write_all(bytes) {
                Ok(_) => {
                    // Send cut command
                    let cut_command = vec![0x1D, 0x56, 0x00]; // ESC/POS cut command
                    let _ = stream.write_all(&cut_command);
                    Ok(format!("Receipt printed successfully via raw socket to {}:{}", ip, port))
                }
                Err(e) => Err(format!("Failed to write to printer: {}", e))
            }
        }
        Err(e) => Err(format!("Failed to connect to printer at {}:{} - {}", ip, port, e))
    }
}

#[tauri::command]
async fn save_ticket_to_file(content: String, filename: String) -> Result<String, String> {
    use std::fs::File;
    use std::io::Write;
    
    // Create a tickets directory if it doesn't exist
    let tickets_dir = "tickets";
    if let Err(_) = std::fs::create_dir_all(tickets_dir) {
        // If we can't create the directory, try to save in the current directory
        match File::create(&filename) {
            Ok(mut file) => {
                match file.write_all(content.as_bytes()) {
                    Ok(_) => Ok(format!("Ticket saved to file: {}", filename)),
                    Err(e) => Err(format!("Failed to write to file: {}", e))
                }
            }
            Err(e) => Err(format!("Failed to create file: {}", e))
        }
    } else {
        // Save in the tickets directory
        let file_path = format!("{}/{}", tickets_dir, filename);
        match File::create(&file_path) {
            Ok(mut file) => {
                match file.write_all(content.as_bytes()) {
                    Ok(_) => Ok(format!("Ticket saved to file: {}", file_path)),
                    Err(e) => Err(format!("Failed to write to file: {}", e))
                }
            }
            Err(e) => Err(format!("Failed to create file: {}", e))
        }
    }
}

#[tauri::command]
async fn db_ban_vehicle(vehicle_id: String) -> Result<String, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    
    // Update vehicle to be banned
    let result = client.execute(
        "UPDATE vehicles SET is_banned = true, updated_at = NOW() WHERE id = $1",
        &[&vehicle_id]
    ).await.map_err(|e| e.to_string())?;
    
    if result == 0 {
        return Err(format!("Véhicule introuvable avec l'ID: {}", vehicle_id));
    }
    
    Ok(format!("Véhicule banni avec succès"))
}

#[tauri::command]
async fn db_get_vehicle_daily_report(vehicle_id: String, date: String) -> Result<VehicleDailyReport, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    
    // Get vehicle information
    let vehicle_row = client.query_opt(
        "SELECT id, license_plate, capacity, is_active, is_available, is_banned FROM vehicles WHERE id = $1",
        &[&vehicle_id]
    ).await.map_err(|e| e.to_string())?;
    
    let vehicle = match vehicle_row {
        Some(row) => VehicleInfo {
            id: row.get("id"),
            licensePlate: row.get("license_plate"),
            capacity: row.get("capacity"),
            isActive: row.get("is_active"),
            isAvailable: row.get("is_available"),
            isBanned: row.get("is_banned"),
        },
        None => return Err("Véhicule introuvable".to_string()),
    };
    
    // Get trips for the day
    let trip_rows = client.query(
        "SELECT 
            id, destination_id, destination_name, queue_position, available_seats, total_seats, 
            base_price, entered_at, entered_at AS created_at
        FROM vehicle_queue 
        WHERE vehicle_id = $1 AND DATE(entered_at) = $2
        ORDER BY entered_at",
        &[&vehicle_id, &date]
    ).await.map_err(|e| e.to_string())?;
    
    let trips: Vec<TripInfo> = trip_rows.into_iter().map(|row| TripInfo {
        id: row.get("id"),
        destinationId: row.get("destination_id"),
        destinationName: row.get("destination_name"),
        queuePosition: row.get("queue_position"),
        availableSeats: row.get("available_seats"),
        totalSeats: row.get("total_seats"),
        basePrice: row.get("base_price"),
        enteredAt: row.get("entered_at"),
        createdAt: row.get("created_at"),
    }).collect();
    
    // Calculate totals
    let total_trips = trips.len() as i32;
    let total_income: f64 = trips.iter().map(|t| t.basePrice * (t.totalSeats - t.availableSeats) as f64).sum();
    let total_seats_sold: i32 = trips.iter().map(|t| t.totalSeats - t.availableSeats).sum();
    
    // Get destinations summary
    let mut destinations: std::collections::HashMap<String, DestinationSummary> = std::collections::HashMap::new();
    for trip in &trips {
        let entry = destinations.entry(trip.destinationName.clone()).or_insert(DestinationSummary {
            destinationName: trip.destinationName.clone(),
            tripCount: 0,
            totalSeatsSold: 0,
            totalIncome: 0.0,
        });
        entry.tripCount += 1;
        entry.totalSeatsSold += trip.totalSeats - trip.availableSeats;
        entry.totalIncome += trip.basePrice * (trip.totalSeats - trip.availableSeats) as f64;
    }
    
    Ok(VehicleDailyReport {
        vehicle,
        date,
        trips,
        totalTrips: total_trips,
        totalIncome: total_income,
        totalSeatsSold: total_seats_sold,
        destinations: destinations.into_values().collect(),
    })
}

#[tauri::command]
async fn db_get_all_vehicles_daily_report(date: String) -> Result<AllVehiclesDailyReport, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    
    // Get all vehicles with their trips for the day
    let rows = client.query(
        "SELECT 
            v.id as vehicle_id, v.license_plate, v.capacity, v.is_active, v.is_available, v.is_banned,
            q.id as trip_id, q.destination_id, q.destination_name, q.queue_position, 
            q.available_seats, q.total_seats, q.base_price, q.entered_at, q.entered_at AS created_at
        FROM vehicles v
        LEFT JOIN vehicle_queue q ON v.id = q.vehicle_id AND DATE(q.entered_at) = $1
        WHERE v.is_banned = false
        ORDER BY v.license_plate, q.entered_at",
        &[&date]
    ).await.map_err(|e| e.to_string())?;
    
    let mut vehicles: std::collections::HashMap<String, VehicleReport> = std::collections::HashMap::new();
    
    for row in rows {
        let vehicle_id: String = row.get("vehicle_id");
        let license_plate: String = row.get("license_plate");
        
        let vehicle_entry = vehicles.entry(vehicle_id.clone()).or_insert(VehicleReport {
            vehicle: VehicleInfo {
                id: vehicle_id.clone(),
                licensePlate: license_plate.clone(),
                capacity: row.get("capacity"),
                isActive: row.get("is_active"),
                isAvailable: row.get("is_available"),
                isBanned: row.get("is_banned"),
            },
            totalTrips: 0,
            totalIncome: 0.0,
            totalSeatsSold: 0,
            trips: Vec::new(),
        });
        
        // Add trip if exists
        if let Some(trip_id) = row.get::<_, Option<String>>("trip_id") {
            let trip = TripInfo {
                id: trip_id,
                destinationId: row.get("destination_id"),
                destinationName: row.get("destination_name"),
                queuePosition: row.get("queue_position"),
                availableSeats: row.get("available_seats"),
                totalSeats: row.get("total_seats"),
                basePrice: row.get("base_price"),
                enteredAt: row.get("entered_at"),
                createdAt: row.get("created_at"),
            };
            
            vehicle_entry.trips.push(trip.clone());
            vehicle_entry.totalTrips += 1;
            let seats_sold = trip.totalSeats - trip.availableSeats;
            vehicle_entry.totalSeatsSold += seats_sold;
            vehicle_entry.totalIncome += trip.basePrice * seats_sold as f64;
        }
    }
    
    // Calculate overall totals
    let total_vehicles = vehicles.len() as i32;
    let total_trips: i32 = vehicles.values().map(|v| v.totalTrips).sum();
    let total_income: f64 = vehicles.values().map(|v| v.totalIncome).sum();
    let total_seats_sold: i32 = vehicles.values().map(|v| v.totalSeatsSold).sum();
    
    Ok(AllVehiclesDailyReport {
        date,
        vehicles: vehicles.into_values().collect(),
        totalVehicles: total_vehicles,
        totalTrips: total_trips,
        totalIncome: total_income,
        totalSeatsSold: total_seats_sold,
    })
}

#[tauri::command]
async fn db_add_vehicle_to_queue(license_plate: String, destination_id: String, destination_name: Option<String>) -> Result<String, String> {
    let mut client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let tx = client.build_transaction().start().await.map_err(|e| e.to_string())?;

    // Find vehicle by license plate
    let veh_row_opt = tx.query_opt("SELECT id, capacity, is_active FROM vehicles WHERE license_plate = $1", &[&license_plate])
        .await.map_err(|e| e.to_string())?;
    if veh_row_opt.is_none() {
        return Err(format!("Véhicule introuvable: {}", license_plate));
    }
    let veh_row = veh_row_opt.unwrap();
    let vehicle_id: String = veh_row.get("id");
    let total_seats: i32 = veh_row.get::<_, i32>("capacity");
    let is_active: bool = veh_row.get::<_, bool>("is_active");
    if !is_active {
        return Err(format!("Véhicule inactif: {}", license_plate));
    }

    // Check if vehicle is already in queue
    let existing_queue = tx.query_opt(
        "SELECT id, destination_name FROM vehicle_queue WHERE vehicle_id = $1",
        &[&vehicle_id]
    ).await.map_err(|e| e.to_string())?;
    
    if existing_queue.is_some() {
        return Err(format!("Véhicule {} est déjà dans une file d'attente", license_plate));
    }

    // Get next position for this destination
    let pos_row = tx.query_one("SELECT COALESCE(MAX(queue_position), 0)+1 AS next_pos FROM vehicle_queue WHERE destination_id = $1", &[&destination_id])
        .await.map_err(|e| e.to_string())?;
    let next_pos: i32 = pos_row.get("next_pos");

    // Get base price and destination name
    let price_row = tx.query_opt("SELECT base_price, station_name FROM routes WHERE station_id = $1", &[&destination_id])
        .await.map_err(|e| e.to_string())?;
    let mut base_price: f64 = 0.0;
    let mut resolved_name: Option<String> = None;
    if let Some(r) = price_row {
        base_price = r.get::<_, f64>("base_price");
        let n: String = r.get("station_name");
        if !n.is_empty() { resolved_name = Some(n); }
    }
    if resolved_name.is_none() {
        if let Some(n) = &destination_name { resolved_name = Some(n.clone()); }
    }
    let dest_name = resolved_name.unwrap_or_else(|| destination_id.clone());

    // Insert new queue entry
    let qid = uuid::Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO vehicle_queue (id, vehicle_id, destination_id, destination_name, queue_position, status, entered_at, available_seats, total_seats, base_price) VALUES ($1,$2,$3,$4,$5,'WAITING',NOW(),$6,$7,$8)",
        &[&qid, &vehicle_id, &destination_id, &dest_name, &next_pos, &(total_seats as i32), &(total_seats as i32), &base_price]
    ).await.map_err(|e| format!("Insertion dans la file échouée: {}", e))?;

    tx.commit().await.map_err(|e| e.to_string())?;

    // Print day pass ticket in background (non-blocking)
    let lp_clone = license_plate.clone();
    let dest_name_clone = dest_name.clone();
    tauri::async_runtime::spawn(async move {
        let _ = print_entry_or_daypass_if_needed(lp_clone, dest_name_clone, 2.0, None).await;
    });

    Ok(format!("Véhicule {} ajouté à la file d'attente pour {}", license_plate, dest_name))
}

#[tauri::command]
async fn db_remove_vehicle_from_queue(license_plate: String) -> Result<String, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let sql = r#"DELETE FROM vehicle_queue WHERE vehicle_id = (SELECT id FROM vehicles WHERE license_plate = $1)"#;
    let res = client.execute(sql, &[&license_plate]).await.map_err(|e| e.to_string())?;
    if res == 0 {
        return Err(format!("Aucune entrée de file trouvée pour le véhicule {}", license_plate));
    }
    Ok(format!("Véhicule {} retiré de la file d'attente", license_plate))
}

#[tauri::command]
async fn db_update_queue_position(queue_id: String, new_position: i32) -> Result<String, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let sql = r#"UPDATE vehicle_queue SET queue_position = $1 WHERE id = $2"#;
    let res = client.execute(sql, &[&new_position, &queue_id]).await.map_err(|e| e.to_string())?;
    if res == 0 {
        return Err("Entrée de file non trouvée".to_string());
    }
    Ok("Position mise à jour avec succès".to_string())
}

#[tauri::command]
async fn db_get_vehicle_queue_status(license_plate: String) -> Result<Option<VehicleQueueStatusDto>, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let sql = r#"
        SELECT q.id, q.vehicle_id, v.license_plate, q.destination_id, q.destination_name,
               q.queue_position, q.status, q.available_seats, q.total_seats, q.base_price,
               q.entered_at
        FROM vehicle_queue q
        JOIN vehicles v ON q.vehicle_id = v.id
        WHERE v.license_plate = $1
    "#;
    let row_opt = client.query_opt(sql, &[&license_plate]).await.map_err(|e| e.to_string())?;
    
    if let Some(row) = row_opt {
        let status = VehicleQueueStatusDto {
            id: row.get("id"),
            vehicleId: row.get("vehicle_id"),
            licensePlate: row.get("license_plate"),
            destinationId: row.get("destination_id"),
            destinationName: row.get("destination_name"),
            queuePosition: row.get("queue_position"),
            status: row.get("status"),
            availableSeats: row.get("available_seats"),
            totalSeats: row.get("total_seats"),
            basePrice: row.get("base_price"),
            enteredAt: format!("{}", row.get::<_, chrono::NaiveDateTime>("entered_at")),
        };
        Ok(Some(status))
    } else {
        Ok(None)
    }
}

#[tauri::command]
async fn db_purchase_day_pass(license_plate: String, vehicle_id: String, price: f64, created_by: Option<String>) -> Result<String, String> {
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    
    // Check if day pass already exists for today using Tunisian time
    let existing_day_pass = client.query_opt(
        "SELECT id FROM day_passes WHERE license_plate = $1 AND is_active = true AND (purchase_date AT TIME ZONE 'Africa/Tunis')::date = (NOW() AT TIME ZONE 'Africa/Tunis')::date",
        &[&license_plate]
    ).await.map_err(|e| e.to_string())?;
    
    if existing_day_pass.is_some() {
        return Err("Un pass journalier valide existe déjà pour ce véhicule aujourd'hui".to_string());
    }
    
    // Create day pass with Tunisian time
    let day_pass_id = uuid::Uuid::new_v4().to_string();
    let staff_id = created_by.unwrap_or_else(|| {
        // Use the first available staff ID as fallback
        "staff_1758995428363_2nhfegsve".to_string()
    });
    let final_price = if price <= 0.0 { 2.0 } else { price };

    // Resolve staff name for printing
    let staff_name_for_print: String = {
        let staff_row = client.query_opt(
            "SELECT first_name, last_name FROM staff WHERE id = $1",
            &[&staff_id]
        ).await.map_err(|e| e.to_string())?;
        if let Some(r) = staff_row {
            let first: String = r.get("first_name");
            let last: String = r.get("last_name");
            format!("{} {}", first, last)
        } else {
            "Staff".to_string()
        }
    };
    
    // Get current Tunisian time
    let now_tunisian = chrono::Utc::now().with_timezone(&chrono_tz::Africa::Tunis);
    let today_start = now_tunisian.date_naive().and_hms_opt(0, 0, 0).unwrap();
    let today_end = now_tunisian.date_naive().and_hms_opt(23, 59, 59).unwrap();
    
    // Convert to UTC for database storage
    let now_utc = now_tunisian.with_timezone(&chrono::Utc);
    let today_start_utc = today_start.and_local_timezone(chrono_tz::Africa::Tunis).unwrap().with_timezone(&chrono::Utc);
    let today_end_utc = today_end.and_local_timezone(chrono_tz::Africa::Tunis).unwrap().with_timezone(&chrono::Utc);
    
    client.execute(
        "INSERT INTO day_passes (id, vehicle_id, license_plate, price, purchase_date, valid_from, valid_until, is_active, is_expired, created_by, created_at, updated_at) 
         VALUES ($1,$2,$3,$4, $5 AT TIME ZONE 'Africa/Tunis', $6 AT TIME ZONE 'Africa/Tunis', $7 AT TIME ZONE 'Africa/Tunis', true, false, $8, $5 AT TIME ZONE 'Africa/Tunis', $5 AT TIME ZONE 'Africa/Tunis')",
        &[&day_pass_id, &vehicle_id, &license_plate, &final_price, &now_utc, &today_start_utc, &today_end_utc, &staff_id]
    ).await.map_err(|e| e.to_string())?;
    
    // Get destination from vehicle queue table (simple query)
    let queue_destination_row = client.query_opt(
        "SELECT vq.destination_name FROM vehicle_queue vq JOIN vehicles v ON vq.vehicle_id = v.id WHERE v.license_plate = $1 ORDER BY vq.entered_at DESC LIMIT 1",
        &[&license_plate]
    ).await.map_err(|e| e.to_string())?;
    
    let queue_destination = if let Some(row) = queue_destination_row {
        let dest = row.get::<_, String>("destination_name");
        println!("🎯 [DAY PASS PURCHASE DEBUG] Found destination in queue: {}", dest);
        dest
    } else {
        println!("❌ [DAY PASS PURCHASE DEBUG] No destination found in queue for vehicle: {}", license_plate);
        "Destination inconnue".to_string() // Fallback if not found in queue
    };
    
    println!("🎯 [DAY PASS PURCHASE DEBUG] Final destination to use: {}", queue_destination);
    
    // Print day pass ticket
    let day_pass_number = format!("DP{}", chrono::Utc::now().timestamp_millis().to_string().chars().rev().take(8).collect::<String>().chars().rev().collect::<String>());
    let dp_ticket = serde_json::json!({
        "dayPassNumber": day_pass_number,
        "licensePlate": license_plate,
        "driverName": "",
        "amount": final_price.to_string(),
        "purchaseDate": now_tunisian.format("%Y-%m-%d %H:%M:%S").to_string(),
        "validFor": now_tunisian.format("%Y-%m-%d").to_string(),
        "destinationName": queue_destination,
        "isReprint": false,
        "staffName": staff_name_for_print,
        "staffId": staff_id
    }).to_string();
    
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let guard = printer.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };
    
    // Print in background (non-blocking)
    tauri::async_runtime::spawn(async move {
        let _ = printer_clone.print_day_pass_ticket(dp_ticket, Some(staff_name_for_print)).await;
    });
    
    Ok(format!("Pass journalier acheté avec succès pour {} ({} TND)", license_plate, price))
}

#[tauri::command]
async fn db_get_day_pass_price() -> Result<f64, String> {
    // For now, return a fixed price. In the future, this could be configurable
    Ok(2.0)
}

#[tauri::command]
async fn test_day_pass_printing(license_plate: String, destination_name: String) -> Result<String, String> {
    println!("🧪 [TEST DEBUG] Testing day pass printing for vehicle: {} to destination: {}", license_plate, destination_name);
    
    let result = print_entry_or_daypass_if_needed(license_plate.clone(), destination_name.clone(), 2.0, None).await;
    match result {
        Ok(_) => {
            println!("✅ [TEST DEBUG] Day pass printing test completed successfully for {}", license_plate);
            Ok(format!("Day pass printing test completed successfully for {}", license_plate))
        },
        Err(e) => {
            println!("❌ [TEST DEBUG] Day pass printing test failed for {}: {}", license_plate, e);
            Err(format!("Day pass printing test failed for {}: {}", license_plate, e))
        }
    }
}

#[tauri::command]
async fn force_print_day_pass_ticket(license_plate: String, destination_name: String) -> Result<String, String> {
    println!("🖨️ [FORCE PRINT] Force printing day pass ticket for vehicle: {} to destination: {}", license_plate, destination_name);
    
    let result = print_entry_or_daypass_if_needed(license_plate.clone(), destination_name.clone(), 2.0, None).await;
    match result {
        Ok(_) => {
            println!("✅ [FORCE PRINT] Day pass ticket force printed successfully for {}", license_plate);
            Ok(format!("Day pass ticket force printed successfully for {}", license_plate))
        },
        Err(e) => {
            println!("❌ [FORCE PRINT] Day pass ticket force print failed for {}: {}", license_plate, e);
            Err(format!("Day pass ticket force print failed for {}: {}", license_plate, e))
        }
    }
}

#[tauri::command]
async fn test_day_pass_printing_with_vehicle(license_plate: String, destination_name: String) -> Result<String, String> {
    println!("🧪 [TEST VEHICLE] Testing day pass printing for vehicle: {} to destination: {}", license_plate, destination_name);
    
    // First check if vehicle exists
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    let vehicle_check = client.query_opt(
        "SELECT id, license_plate FROM vehicles WHERE license_plate = $1",
        &[&license_plate]
    ).await.map_err(|e| e.to_string())?;
    
    if vehicle_check.is_none() {
        return Err(format!("Vehicle {} not found in database", license_plate));
    }
    
    println!("✅ [TEST VEHICLE] Vehicle {} found in database, proceeding with day pass test", license_plate);
    
    // Test the day pass printing
    let result = print_entry_or_daypass_if_needed(license_plate.clone(), destination_name.clone(), 2.0, None).await;
    match result {
        Ok(_) => {
            println!("✅ [TEST VEHICLE] Day pass printing test completed successfully for {}", license_plate);
            Ok(format!("Day pass printing test completed successfully for vehicle: {}", license_plate))
        },
        Err(e) => {
            println!("❌ [TEST VEHICLE] Day pass printing test failed for {}: {}", license_plate, e);
            Err(format!("Day pass printing test failed for vehicle {}: {}", license_plate, e))
        }
    }
}

#[tauri::command]
async fn check_vehicle_day_passes(license_plate: String) -> Result<String, String> {
    println!("🔍 [DAY PASS CHECK] Checking day passes for vehicle: {}", license_plate);
    
    let client = DB_POOL.get().await.map_err(|e| e.to_string())?;
    
    // Get current Tunisian date
    let now_tunisian = chrono::Utc::now().with_timezone(&chrono_tz::Africa::Tunis);
    let today_date = now_tunisian.date_naive();
    
    println!("📅 [DAY PASS CHECK] Current Tunisian date: {}", today_date.format("%Y-%m-%d"));
    
    // Check all day passes for this vehicle
    let all_day_passes = client.query(
        "SELECT id, price, purchase_date, is_active, 
                (purchase_date AT TIME ZONE 'Africa/Tunis')::date as tunisian_date
         FROM day_passes 
         WHERE license_plate = $1 
         ORDER BY purchase_date DESC",
        &[&license_plate]
    ).await.map_err(|e| e.to_string())?;
    
    println!("📊 [DAY PASS CHECK] Found {} day pass records for vehicle {}", all_day_passes.len(), license_plate);
    
    let mut result = format!("Day Pass Check for Vehicle: {}\n", license_plate);
    result.push_str(&format!("Current Tunisian Date: {}\n\n", today_date.format("%Y-%m-%d")));
    
    for (i, row) in all_day_passes.iter().enumerate() {
        let day_pass_id: String = row.get("id");
        let price: f64 = row.get("price");
        let purchase_date: chrono::DateTime<chrono::Utc> = row.get("purchase_date");
        let is_active: bool = row.get("is_active");
        let tunisian_date: chrono::NaiveDate = row.get("tunisian_date");
        
        let tunisian_time = purchase_date.with_timezone(&chrono_tz::Africa::Tunis);
        
        let is_today = tunisian_date == today_date;
        let status = if is_today && is_active { "✅ TODAY & ACTIVE" } 
                    else if is_today && !is_active { "⚠️ TODAY & INACTIVE" }
                    else if is_active { "✅ ACTIVE (other day)" }
                    else { "❌ INACTIVE" };
        
        result.push_str(&format!(
            "Record {}: ID={}, Price={} TND, Date={}, Tunisian Date={}, Active={}, Status={}\n",
            i + 1, day_pass_id, price, tunisian_time.format("%Y-%m-%d %H:%M:%S"), 
            tunisian_date.format("%Y-%m-%d"), is_active, status
        ));
    }
    
    // Check specifically for today's day pass
    let today_day_pass = client.query_opt(
        "SELECT id, price, purchase_date FROM day_passes 
         WHERE license_plate = $1 
         AND is_active = true 
         AND (purchase_date AT TIME ZONE 'Africa/Tunis')::date = (NOW() AT TIME ZONE 'Africa/Tunis')::date 
         ORDER BY purchase_date DESC LIMIT 1",
        &[&license_plate]
    ).await.map_err(|e| e.to_string())?;
    
    if let Some(row) = today_day_pass {
        let day_pass_price: f64 = row.get("price");
        result.push_str(&format!("\n🎯 RESULT: Vehicle HAS a day pass for today (Price: {} TND) - Will print 0 TND reprint ticket", day_pass_price));
    } else {
        result.push_str(&format!("\n🎯 RESULT: Vehicle has NO day pass for today - Will print 2 TND new day pass ticket"));
    }
    
    println!("{}", result);
    Ok(result)
}

#[tauri::command]
async fn debug_printer_status() -> Result<String, String> {
    // Get current printer config and env snapshot first
    let (current_printer, env_snapshot) = {
        let printer = PRINTER_SERVICE.lock().map_err(|e| e.to_string())?;
        let current_printer = printer.get_current_printer()?;
        let env_snapshot = printer.debug_env_snapshot();
        (current_printer, env_snapshot)
    };
    
    let mut debug_info = String::new();
    debug_info.push_str("=== PRINTER DEBUG INFO ===\n");
    
    if let Some(config) = current_printer {
        debug_info.push_str(&format!("Current Printer: {} ({}:{})\n", config.name, config.ip, config.port));
        debug_info.push_str(&format!("Width: {}, Timeout: {}ms, Model: {}\n", config.width, config.timeout, config.model));
        debug_info.push_str(&format!("Enabled: {}, Default: {}\n", config.enabled, config.is_default));
    } else {
        debug_info.push_str("No current printer configured\n");
    }
    
    debug_info.push_str("\n=== ENVIRONMENT VARIABLES ===\n");
    for (key, value) in env_snapshot.iter() {
        debug_info.push_str(&format!("{}: {}\n", key, value));
    }
    
    // Test printer connection
    debug_info.push_str("\n=== PRINTER CONNECTION TEST ===\n");
    let printer_clone = {
        let printer = PRINTER_SERVICE.lock().map_err(|e| e.to_string())?;
        printer.clone()
    };
    let connection_result = printer_clone.test_connection().await;
    match connection_result {
        Ok(status) => {
            debug_info.push_str(&format!("Connection Status: {}\n", if status.connected { "CONNECTED" } else { "DISCONNECTED" }));
            if let Some(error) = status.error {
                debug_info.push_str(&format!("Error: {}\n", error));
            }
        },
        Err(e) => {
            debug_info.push_str(&format!("Connection Test Failed: {}\n", e));
        }
    }
    
    println!("🔍 [PRINTER DEBUG] {}", debug_info);
    Ok(debug_info)
}

#[tauri::command]
async fn print_talon(talon_data: String, staff_name: Option<String>) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_talon(talon_data, staff_name).await
}

#[tauri::command]
async fn print_entry_ticket(ticket_data: String, staff_name: Option<String>) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_entry_ticket(ticket_data, staff_name).await
}

#[tauri::command]
async fn print_exit_ticket(ticket_data: String, staff_name: Option<String>) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_exit_ticket(ticket_data, staff_name).await
}

// Reprint last tickets
#[tauri::command]
async fn reprint_booking_ticket() -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.reprint_booking_ticket().await
}

#[tauri::command]
async fn reprint_entry_ticket() -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.reprint_entry_ticket().await
}

#[tauri::command]
async fn reprint_exit_ticket() -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.reprint_exit_ticket().await
}

#[tauri::command]
async fn print_day_pass_ticket(ticket_data: String, staff_name: Option<String>) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_day_pass_ticket(ticket_data, staff_name).await
}

#[tauri::command]
async fn reprint_day_pass_ticket() -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.reprint_day_pass_ticket().await
}

#[tauri::command]
async fn print_exit_pass_ticket(ticket_data: String, staff_name: Option<String>) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_exit_pass_ticket(ticket_data, staff_name).await
}

// Direct TCP printing commands (Windows-compatible)
#[tauri::command]
async fn print_direct_tcp(printer_id: String, content: String) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.print_direct_tcp(&printer_id, &content).await
}

#[tauri::command]
async fn test_direct_tcp_connection(printer_id: String) -> Result<String, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.test_direct_tcp_connection(&printer_id).await
}

#[tauri::command]
async fn test_printer_connection_manual(ip: String, port: u16) -> Result<PrinterStatus, String> {
    let printer = PRINTER_SERVICE.clone();
    let printer_clone = {
        let printer_guard = printer.lock().map_err(|e| e.to_string())?;
        printer_guard.clone()
    };
    printer_clone.test_connection_manual(&ip, port).await
}

#[tauri::command]
async fn update_printer_config_manual(config: serde_json::Value) -> Result<(), String> {
    let printer = PRINTER_SERVICE.lock().map_err(|e| e.to_string())?;
    
    // Extract IP and port from the config
    let ip = config.get("ip")
        .and_then(|v| v.as_str())
        .ok_or("Missing IP in config")?;
    let port = config.get("port")
        .and_then(|v| v.as_u64())
        .ok_or("Missing port in config")? as u16;
    let enabled = config.get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    
    // Update the printer configuration (this will automatically save to file)
    printer.update_config_manual(ip, port, enabled)
}

#[tauri::command]
async fn save_printer_config() -> Result<String, String> {
    let printer = PRINTER_SERVICE.lock().map_err(|e| e.to_string())?;
    
    // Save the current configuration to file
    printer.save_config()?;
    
    Ok("Printer configuration saved successfully".to_string())
}

async fn scan_ip(ip: &str, port: u16, client: &Client) -> Result<Option<DiscoveredServer>, Box<dyn std::error::Error + Send + Sync>> {
    let url = format!("http://{}:{}/health", ip, port);
    
    let start_time = std::time::Instant::now();
    
    match client.get(&url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                let response_time = start_time.elapsed().as_millis() as u64;
                
                // Try to parse response to verify it's our local node server
                if let Ok(body) = response.text().await {
                                    // Check if the response contains indicators of our local node server
                if body.contains("local-node") || 
                   body.contains("Louaj") || 
                   body.contains("status") ||
                   body.contains("database") ||
                   body.contains("uptime") ||
                   body.contains("health") ||
                   body.contains("express") ||
                   body.contains("node") {
                        return Ok(Some(DiscoveredServer {
                            ip: ip.to_string(),
                            port,
                            url: format!("http://{}:{}", ip, port),
                            response_time,
                        }));
                    }
                }
            }
        }
        Err(_) => {
            // Connection failed, which is expected for most IPs
        }
    }
    
    Ok(None)
}

fn get_local_ip() -> Result<IpAddr, Box<dyn std::error::Error>> {
    // HARDCODED: Use the ethernet IP for testing
    let hardcoded_ip = "127.0.0.1".parse::<IpAddr>()?;
    println!("🔍 Using hardcoded ethernet IP: {}", hardcoded_ip);
    return Ok(hardcoded_ip);
    
    /* DISABLED: All the complex IP detection logic
    use std::process::Command;
    
    println!("🔍 get_local_ip() function called!");
    
    // First, try to directly get the ethernet IP using ifconfig enp4s0
    println!("🔍 Trying ifconfig enp4s0...");
    if let Ok(output) = Command::new("ifconfig")
        .args(&["enp4s0"])
        .output()
    {
        println!("🔍 ifconfig command executed, status: {}", output.status);
        if output.status.success() {
            let output_str = String::from_utf8_lossy(&output.stdout);
            println!("🔍 ifconfig output: {}", output_str);
            for line in output_str.lines() {
                if line.contains("inet ") {
                    println!("🔍 Found inet line: {}", line);
                    if let Some(ip_part) = line.split_whitespace().find(|part| part.starts_with("inet")) {
                        if let Some(ip_str) = ip_part.split_whitespace().nth(1) {
                            println!("🔍 Found IP string: {}", ip_str);
                            if let Ok(ip) = ip_str.parse::<IpAddr>() {
                                if ip.is_ipv4() && !ip.is_loopback() {
                                    println!("🔍 Found ethernet IP via ifconfig enp4s0: {}", ip);
                                    return Ok(ip);
                                }
                            }
                        }
                    }
                }
            }
        } else {
            println!("🔍 ifconfig command failed with status: {}", output.status);
        }
    } else {
        println!("🔍 Failed to execute ifconfig command");
    }
    
    // Fallback: try to get ethernet IP using ip addr show command
    if let Ok(output) = Command::new("ip")
        .args(&["addr", "show"])
        .output()
    {
        if output.status.success() {
            let output_str = String::from_utf8_lossy(&output.stdout);
            let mut ethernet_ips = Vec::new();
            let mut other_ips = Vec::new();
            
            for line in output_str.lines() {
                if line.contains("inet ") && !line.contains("127.0.0.1") {
                    // Check if this is an ethernet interface
                    let is_ethernet = line.contains("eth") || line.contains("enp") || line.contains("ens");
                    
                    if let Some(ip_part) = line.split_whitespace().find(|part| part.starts_with("inet")) {
                        if let Some(ip_str) = ip_part.split_whitespace().nth(1) {
                            if let Some(ip_with_mask) = ip_str.split('/').next() {
                                if let Ok(ip) = ip_with_mask.parse::<IpAddr>() {
                                    if ip.is_ipv4() && !ip.is_loopback() {
                                        if is_ethernet {
                                            ethernet_ips.push(ip);
                                        } else {
                                            other_ips.push(ip);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            // Prioritize ethernet IPs (especially 192.168.192.x range)
            if let Some(ethernet_ip) = ethernet_ips.iter().find(|ip| {
                if let IpAddr::V4(ipv4) = ip {
                    ipv4.octets()[0] == 192 && ipv4.octets()[1] == 168 && ipv4.octets()[2] == 192
                } else {
                    false
                }
            }) {
                println!("🔍 Found ethernet IP in 192.168.192.x range: {}", ethernet_ip);
                return Ok(*ethernet_ip);
            }
            
            // Fallback to any ethernet IP
            if let Some(ethernet_ip) = ethernet_ips.first() {
                println!("🔍 Found ethernet IP via ip addr: {}", ethernet_ip);
                return Ok(*ethernet_ip);
            }
            
            // Fallback to other IPs
            if let Some(other_ip) = other_ips.first() {
                println!("🔍 Found non-ethernet IP via ip addr: {}", other_ip);
                return Ok(*other_ip);
            }
        }
    }
    
    // Fallback: try to get IP using ip route command, but prioritize 192.168.192.x
    if let Ok(output) = Command::new("ip")
        .args(&["route", "get", "8.8.8.8"])
        .output()
    {
        if output.status.success() {
            let output_str = String::from_utf8_lossy(&output.stdout);
            let mut found_ips = Vec::new();
            
            for line in output_str.lines() {
                if line.contains("src") {
                    if let Some(ip_part) = line.split_whitespace().find(|part| part.starts_with("src")) {
                        if let Some(ip_str) = ip_part.split_whitespace().nth(1) {
                            if let Ok(ip) = ip_str.parse::<IpAddr>() {
                                if ip.is_ipv4() && !ip.is_loopback() {
                                    found_ips.push(ip);
                                }
                            }
                        }
                    }
                }
            }
            
            // Prioritize 192.168.192.x range
            if let Some(printer_network_ip) = found_ips.iter().find(|ip| {
                if let IpAddr::V4(ipv4) = ip {
                    ipv4.octets()[0] == 192 && ipv4.octets()[1] == 168 && ipv4.octets()[2] == 192
                } else {
                    false
                }
            }) {
                println!("🔍 Found printer network IP via ip route: {}", printer_network_ip);
                return Ok(*printer_network_ip);
            }
            
            // Fallback to any found IP
            if let Some(ip) = found_ips.first() {
                println!("🔍 Found IP via ip route: {}", ip);
                return Ok(*ip);
            }
        }
    }
    
    // Fallback: try to get ethernet IP using ifconfig command
    if let Ok(output) = Command::new("ifconfig")
        .output()
    {
        if output.status.success() {
            let output_str = String::from_utf8_lossy(&output.stdout);
            let mut ethernet_ips = Vec::new();
            
            for line in output_str.lines() {
                if line.contains("inet ") && (line.contains("eth0") || line.contains("enp") || line.contains("ens")) {
                    if let Some(ip_part) = line.split_whitespace().find(|part| part.starts_with("inet")) {
                        if let Some(ip_str) = ip_part.split_whitespace().nth(1) {
                            if let Ok(ip) = ip_str.parse::<IpAddr>() {
                                if ip.is_ipv4() && !ip.is_loopback() {
                                    ethernet_ips.push(ip);
                                }
                            }
                        }
                    }
                }
            }
            
            // Prioritize 192.168.192.x range
            if let Some(printer_network_ip) = ethernet_ips.iter().find(|ip| {
                if let IpAddr::V4(ipv4) = ip {
                    ipv4.octets()[0] == 192 && ipv4.octets()[1] == 168 && ipv4.octets()[2] == 192
                } else {
                    false
                }
            }) {
                println!("🔍 Found printer network IP via ifconfig: {}", printer_network_ip);
                return Ok(*printer_network_ip);
            }
            
            // Fallback to any ethernet IP
            if let Some(ethernet_ip) = ethernet_ips.first() {
                println!("🔍 Found ethernet IP via ifconfig: {}", ethernet_ip);
                return Ok(*ethernet_ip);
            }
        }
    }
    
    // Fallback: try to get ethernet IP using nmcli command
    if let Ok(output) = Command::new("nmcli")
        .args(&["-t", "-f", "IP4.ADDRESS", "device", "show"])
        .output()
    {
        if output.status.success() {
            let output_str = String::from_utf8_lossy(&output.stdout);
            let mut ethernet_ips = Vec::new();
            
            for line in output_str.lines() {
                if line.contains("eth0") || line.contains("enp") || line.contains("ens") {
                    if let Some(ip_str) = line.split(':').nth(1) {
                        if let Some(ip) = ip_str.split('/').next() {
                            if let Ok(ip_addr) = ip.parse::<IpAddr>() {
                                if ip_addr.is_ipv4() && !ip_addr.is_loopback() {
                                    ethernet_ips.push(ip_addr);
                                }
                            }
                        }
                    }
                }
            }
            
            // Prioritize 192.168.192.x range
            if let Some(printer_network_ip) = ethernet_ips.iter().find(|ip| {
                if let IpAddr::V4(ipv4) = ip {
                    ipv4.octets()[0] == 192 && ipv4.octets()[1] == 168 && ipv4.octets()[2] == 192
                } else {
                    false
                }
            }) {
                println!("🔍 Found printer network IP via nmcli: {}", printer_network_ip);
                return Ok(*printer_network_ip);
            }
            
            // Fallback to any ethernet IP
            if let Some(ethernet_ip) = ethernet_ips.first() {
                println!("🔍 Found ethernet IP via nmcli: {}", ethernet_ip);
                return Ok(*ethernet_ip);
            }
        }
    }
    
    // Final fallback: try to get local IP by connecting to a known address
    let socket = std::net::UdpSocket::bind("0.0.0.0:0")?;
    socket.connect("8.8.8.8:80")?;
    let local_addr = socket.local_addr()?;
    let detected_ip = local_addr.ip();
    
    // If the detected IP is not in the printer network range, try to find ethernet IP manually
    if let IpAddr::V4(ipv4) = detected_ip {
        if !(ipv4.octets()[0] == 192 && ipv4.octets()[1] == 168 && ipv4.octets()[2] == 192) {
            // Try to find ethernet IP manually using ifconfig
            if let Ok(output) = Command::new("ifconfig")
                .args(&["enp4s0"])
                .output()
            {
                if output.status.success() {
                    let output_str = String::from_utf8_lossy(&output.stdout);
                    for line in output_str.lines() {
                        if line.contains("inet ") {
                            if let Some(ip_part) = line.split_whitespace().find(|part| part.starts_with("inet")) {
                                if let Some(ip_str) = ip_part.split_whitespace().nth(1) {
                                    if let Ok(ethernet_ip) = ip_str.parse::<IpAddr>() {
                                        if ethernet_ip.is_ipv4() && !ethernet_ip.is_loopback() {
                                            println!("🔍 Found ethernet IP via ifconfig enp4s0: {}", ethernet_ip);
                                            return Ok(ethernet_ip);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    println!("🔍 Using fallback method for IP detection: {}", detected_ip);
    Ok(detected_ip)
    */
}

fn get_network_prefix(ip: &IpAddr) -> String {
    match ip {
        IpAddr::V4(ipv4) => {
            let octets = ipv4.octets();
            format!("{}.{}.{}", octets[0], octets[1], octets[2])
        }
        IpAddr::V6(_) => {
            // For IPv6, we'll use a default local network
            "192.168.1".to_string()
        }
    }
}

fn create_system_tray() -> SystemTray {
    let show = CustomMenuItem::new("show".to_string(), "Afficher");
    let hide = CustomMenuItem::new("hide".to_string(), "Masquer");
    let fullscreen = CustomMenuItem::new("fullscreen".to_string(), "Basculer plein écran");
    let startup = CustomMenuItem::new("startup".to_string(), "Démarrage automatique");
    let quit = CustomMenuItem::new("quit".to_string(), "Quitter");
    
    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_item(hide)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(fullscreen)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(startup)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);
    
    SystemTray::new().with_menu(tray_menu)
}

fn handle_system_tray_event(app: &tauri::AppHandle, event: SystemTrayEvent) {
    match event {
        SystemTrayEvent::LeftClick {
            position: _,
            size: _,
            ..
        } => {
            let window = app.get_window("main").unwrap();
            if window.is_visible().unwrap_or(false) {
                let _ = window.hide();
            } else {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        SystemTrayEvent::MenuItemClick { id, .. } => {
            let window = app.get_window("main").unwrap();
            match id.as_str() {
                "show" => {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                "hide" => {
                    let _ = window.hide();
                }
                "fullscreen" => {
                    if let Ok(is_fullscreen) = window.is_fullscreen() {
                        let _ = window.set_fullscreen(!is_fullscreen);
                    }
                }
                "startup" => {
                    // Toggle auto-startup
                    if let Ok(is_enabled) = check_auto_startup() {
                        if is_enabled {
                            let _ = disable_auto_startup();
                        } else {
                            let _ = setup_auto_startup();
                        }
                    }
                }
                "quit" => {
                    std::process::exit(0);
                }
                _ => {}
            }
        }
        _ => {}
    }
}

#[tauri::command]
async fn db_transfer_seats_and_remove_vehicle(license_plate: String, destination_id: String) -> Result<String, String> {
    println!("🔄 Starting seat transfer for vehicle: {} to destination: {}", license_plate, destination_id);
    
    let mut client = DB_POOL.get().await.map_err(|e| format!("Database pool error: {}", e))?;
    let tx = client.build_transaction().start().await.map_err(|e| format!("Transaction start error: {}", e))?;
    
    // First, get the vehicle to remove and its booked seats
    println!("🔍 Looking for vehicle to remove...");
    let vehicle_row = tx.query_opt(
        "SELECT q.id, q.available_seats, q.total_seats, q.queue_position 
         FROM vehicle_queue q
         JOIN vehicles v ON v.id = q.vehicle_id
         WHERE v.license_plate = $1 AND q.destination_id = $2 AND q.status IN ('WAITING', 'LOADING')",
        &[&license_plate, &destination_id]
    )
    .await
    .map_err(|e| format!("Error fetching vehicle to remove: {}", e))?
    .ok_or("Vehicle not found in queue")?;
    
    let vehicle_id: String = vehicle_row.get("id");
    let available_seats: i32 = vehicle_row.get("available_seats");
    let total_seats: i32 = vehicle_row.get("total_seats");
    let queue_position: i32 = vehicle_row.get("queue_position");
    let booked_seats = total_seats - available_seats;
    
    println!("📊 Vehicle found - ID: {}, Available: {}, Total: {}, Booked: {}, Position: {}", 
             vehicle_id, available_seats, total_seats, booked_seats, queue_position);
    
    if booked_seats == 0 {
        println!("✅ No booked seats, removing vehicle directly...");
        // No booked seats, just remove the vehicle
        tx.execute("DELETE FROM vehicle_queue WHERE id = $1", &[&vehicle_id])
            .await.map_err(|e| format!("Error removing vehicle: {}", e))?;
        
        // Update queue positions for remaining vehicles
        tx.execute(
            "UPDATE vehicle_queue SET queue_position = queue_position - 1 
             WHERE destination_id = $1 AND queue_position > $2",
            &[&destination_id, &queue_position]
        )
        .await.map_err(|e| format!("Error updating queue positions: {}", e))?;
        
        tx.commit().await.map_err(|e| format!("Commit error: {}", e))?;
        println!("✅ Vehicle removed successfully");
        return Ok(format!("Véhicule {} retiré de la file", license_plate));
    }
    
    // Find another vehicle in the same queue to transfer seats to
    println!("🔍 Looking for target vehicle to transfer seats to...");
    let target_row = tx.query_opt(
        "SELECT q.id, q.available_seats, q.total_seats 
         FROM vehicle_queue q
         WHERE q.destination_id = $1 AND q.status IN ('WAITING', 'LOADING') AND q.id != $2
         ORDER BY q.queue_position ASC LIMIT 1",
        &[&destination_id, &vehicle_id]
    )
    .await
    .map_err(|e| format!("Error finding target vehicle: {}", e))?
    .ok_or("Aucun autre véhicule disponible dans cette file pour transférer les sièges")?;
    
    let target_id: String = target_row.get("id");
    let target_available_seats: i32 = target_row.get("available_seats");
    
    println!("🎯 Target vehicle found - ID: {}, Available seats: {}", target_id, target_available_seats);
    
    // Check if target vehicle has enough available seats
    if target_available_seats < booked_seats {
        return Err(format!(
            "Le véhicule cible n'a que {} sièges disponibles, mais {} sièges doivent être transférés",
            target_available_seats, booked_seats
        ));
    }
    
    // Transfer the bookings
    println!("🔄 Transferring {} bookings from vehicle {} to vehicle {}...", booked_seats, vehicle_id, target_id);
    tx.execute(
        "UPDATE bookings SET queue_id = $1 WHERE queue_id = $2",
        &[&target_id, &vehicle_id]
    )
    .await
    .map_err(|e| format!("Error transferring bookings: {}", e))?;
    
    // Update target vehicle's available seats
    let new_available_seats = target_available_seats - booked_seats;
    println!("🔄 Updating target vehicle seats from {} to {}...", target_available_seats, new_available_seats);
    tx.execute(
        "UPDATE vehicle_queue SET available_seats = $1 WHERE id = $2",
        &[&new_available_seats, &target_id]
    )
    .await
    .map_err(|e| format!("Error updating target vehicle seats: {}", e))?;
    
    // Check if target vehicle status should be changed from WAITING to LOADING
    let target_status_row = tx.query_opt(
        "SELECT status FROM vehicle_queue WHERE id = $1",
        &[&target_id]
    ).await.map_err(|e| format!("Error checking target vehicle status: {}", e))?;
    
    if let Some(row) = target_status_row {
        let current_status: String = row.get("status");
        if current_status == "WAITING" {
            println!("🚌 [STATUS CHANGE] Changing target vehicle {} from WAITING to LOADING (received transferred seats)", target_id);
            tx.execute("UPDATE vehicle_queue SET status = 'LOADING' WHERE id = $1", &[&target_id])
                .await.map_err(|e| format!("Error updating target vehicle status: {}", e))?;
        }
    }
    
    // Remove the original vehicle
    println!("🗑️ Removing original vehicle {}...", vehicle_id);
    tx.execute("DELETE FROM vehicle_queue WHERE id = $1", &[&vehicle_id])
        .await.map_err(|e| format!("Error removing vehicle: {}", e))?;
    
    // Update queue positions for remaining vehicles
    println!("🔄 Updating queue positions...");
    tx.execute(
        "UPDATE vehicle_queue SET queue_position = queue_position - 1 
         WHERE destination_id = $1 AND queue_position > $2",
        &[&destination_id, &queue_position]
    )
    .await.map_err(|e| format!("Error updating queue positions: {}", e))?;
    
    tx.commit().await.map_err(|e| format!("Commit error: {}", e))?;
    
    println!("✅ Seat transfer and vehicle removal completed successfully");
    Ok(format!(
        "Véhicule {} retiré de la file. {} sièges transférés vers un autre véhicule.",
        license_plate, booked_seats
    ))
}

// Emergency remove vehicle with booked seats (cancel all bookings and calculate refund)
#[tauri::command]
async fn db_emergency_remove_vehicle(license_plate: String) -> Result<serde_json::Value, String> {
    println!("🚨 Starting emergency removal for vehicle: {}", license_plate);
    
    let mut client = DB_POOL.get().await.map_err(|e| format!("Database pool error: {}", e))?;
    let tx = client.build_transaction().start().await.map_err(|e| format!("Transaction start error: {}", e))?;
    
    // First, get the vehicle to remove and its booked seats
    println!("🔍 Looking for vehicle to remove...");
    let vehicle_row = tx.query_opt(
        "SELECT q.id, q.available_seats, q.total_seats, q.queue_position, q.destination_id, q.destination_name
         FROM vehicle_queue q
         JOIN vehicles v ON v.id = q.vehicle_id
         WHERE v.license_plate = $1 AND q.status IN ('WAITING', 'LOADING')",
        &[&license_plate]
    )
    .await
    .map_err(|e| format!("Error fetching vehicle to remove: {}", e))?
    .ok_or("Vehicle not found in queue")?;
    
    let vehicle_id: String = vehicle_row.get("id");
    let available_seats: i32 = vehicle_row.get("available_seats");
    let total_seats: i32 = vehicle_row.get("total_seats");
    let queue_position: i32 = vehicle_row.get("queue_position");
    let destination_id: String = vehicle_row.get("destination_id");
    let destination_name: String = vehicle_row.get("destination_name");
    let booked_seats = total_seats - available_seats;
    
    println!("📊 Vehicle found - ID: {}, Available: {}, Total: {}, Booked: {}, Position: {}", 
             vehicle_id, available_seats, total_seats, booked_seats, queue_position);
    
    if booked_seats == 0 {
        println!("✅ No booked seats, removing vehicle directly...");
        // No booked seats, just remove the vehicle
        tx.execute("DELETE FROM vehicle_queue WHERE id = $1", &[&vehicle_id])
            .await.map_err(|e| format!("Error removing vehicle: {}", e))?;
        
        // Update queue positions for remaining vehicles
        tx.execute(
            "UPDATE vehicle_queue SET queue_position = queue_position - 1 
             WHERE destination_id = $1 AND queue_position > $2",
            &[&destination_id, &queue_position]
        )
        .await.map_err(|e| format!("Error updating queue positions: {}", e))?;
        
        tx.commit().await.map_err(|e| format!("Commit error: {}", e))?;
        println!("✅ Vehicle removed successfully");
        return Ok(serde_json::json!({
            "cancelledBookings": 0,
            "totalRefund": 0.0,
            "message": format!("Véhicule {} retiré de la file (aucune réservation)", license_plate)
        }));
    }
    
    // Get all bookings for this vehicle to calculate refund
    println!("💰 Calculating refund for {} booked seats...", booked_seats);
    let bookings_rows = tx.query(
        "SELECT id, seats_booked, total_amount, verification_code 
         FROM bookings 
         WHERE queue_id = $1 AND payment_status = 'PAID'",
        &[&vehicle_id]
    )
    .await
    .map_err(|e| format!("Error fetching bookings: {}", e))?;
    
    let mut total_refund = 0.0;
    let mut cancelled_bookings = 0;
    
    for row in bookings_rows {
        let booking_id: String = row.get("id");
        let seats_booked: i32 = row.get("seats_booked");
        let total_amount: f64 = row.get("total_amount");
        let verification_code: String = row.get("verification_code");
        
        println!("📋 Cancelling booking {} - {} seats, {} TND", verification_code, seats_booked, total_amount);
        
        // Cancel the booking
        tx.execute(
            "UPDATE bookings SET payment_status = 'CANCELLED', verification_code = $1 WHERE id = $2",
            &[&format!("CANCELLED_{}", verification_code), &booking_id]
        )
        .await
        .map_err(|e| format!("Error cancelling booking {}: {}", booking_id, e))?;
        
        total_refund += total_amount;
        cancelled_bookings += 1;
    }
    
    println!("💰 Total refund calculated: {} TND for {} bookings", total_refund, cancelled_bookings);
    
    // Remove the vehicle from queue
    println!("🗑️ Removing vehicle {} from queue...", vehicle_id);
    tx.execute("DELETE FROM vehicle_queue WHERE id = $1", &[&vehicle_id])
        .await.map_err(|e| format!("Error removing vehicle: {}", e))?;
    
    // Update queue positions for remaining vehicles
    println!("🔄 Updating queue positions...");
    tx.execute(
        "UPDATE vehicle_queue SET queue_position = queue_position - 1 
         WHERE destination_id = $1 AND queue_position > $2",
        &[&destination_id, &queue_position]
    )
    .await.map_err(|e| format!("Error updating queue positions: {}", e))?;
    
    tx.commit().await.map_err(|e| format!("Commit error: {}", e))?;
    
    println!("✅ Emergency removal completed successfully");
    Ok(serde_json::json!({
        "cancelledBookings": cancelled_bookings,
        "totalRefund": total_refund,
        "message": format!("Véhicule {} supprimé d'urgence - {} réservations annulées - Remboursement: {:.3} TND", 
                          license_plate, cancelled_bookings, total_refund)
    }))
}

fn main() {
    let system_tray = create_system_tray();
    
    tauri::Builder::default()
        .system_tray(system_tray)
        .on_system_tray_event(handle_system_tray_event)
        .invoke_handler(tauri::generate_handler![
            greet,
            get_app_version,
            get_app_name,
            get_network_info,
            discover_local_servers,
            add_firewall_rule,
            proxy_localnode,
            toggle_fullscreen,
            minimize_to_tray,
            show_window,
            setup_auto_startup,
            disable_auto_startup,
            check_auto_startup,
            get_all_printers,
            get_printer_by_id,
            get_current_printer,
            reload_printer_env,
            get_printer_env_snapshot,
            set_current_printer,
            update_printer_config,
            add_printer,
            remove_printer,
            test_printer_connection,
            test_printer_connection_by_id,
            auto_set_default_printer,
            print_ticket,
            print_receipt,
            print_qr_code,
            execute_print_job,
            print_with_logo,
            print_standard_ticket,
            print_booking_ticket,
            print_talon,
            print_entry_ticket,
            print_exit_ticket,
            print_day_pass_ticket,
            print_exit_pass_ticket,
            reprint_booking_ticket,
            reprint_entry_ticket,
            reprint_exit_ticket,
            reprint_day_pass_ticket,
            print_direct_tcp,
            test_direct_tcp_connection,
            test_printer_connection_manual,
            update_printer_config_manual,
            save_printer_config,
            db_get_queue_summaries,
            db_get_queue_by_destination,
            db_get_vehicle_authorized_destinations,
            db_enter_queue,
            db_exit_queue,
            db_update_vehicle_status,
            db_get_available_booking_destinations,
            db_get_available_seats_for_destination,
            db_create_queue_booking,
            db_create_vehicle_specific_booking,
            db_cancel_queue_booking,
            db_cancel_seat_from_destination,
            db_health,
            db_has_day_pass_today,
            db_has_day_pass_today_batch,
            db_get_today_day_passes,
            db_get_today_exit_passes,
            db_get_recent_exit_passes,
            db_get_queued_without_day_pass,
            db_end_trip_with_partial_capacity,
            db_update_queue_positions,
            db_move_vehicle_to_front,
            db_get_all_vehicles,
            db_create_vehicle,
            db_update_vehicle_phone,
            db_authorize_vehicle_station,
            db_ban_vehicle,
            db_get_vehicle_daily_report,
            db_get_all_vehicles_daily_report,
            db_add_vehicle_to_queue,
            // Enhanced printer commands with fallback methods
            print_ticket_tcp,
            print_ticket_raw,
            print_receipt_tcp,
            print_receipt_raw,
            save_ticket_to_file,
            db_remove_vehicle_from_queue,
            db_update_queue_position,
            db_get_vehicle_queue_status,
            db_get_available_destinations,
            db_get_stations_by_governorate,
            db_purchase_day_pass,
            db_get_day_pass_price,
            test_day_pass_printing,
            force_print_day_pass_ticket,
            test_day_pass_printing_with_vehicle,
            check_vehicle_day_passes,
            debug_printer_status,
            db_transfer_seats_and_remove_vehicle,
            db_emergency_remove_vehicle,
            db_get_vehicle_activity_72h,
            open_vehicle_window,
            // Realtime commands
            start_realtime_listening,
            stop_realtime_listening,
            get_realtime_status
        ])
        .setup(|app| {
            let app_handle = app.handle();
            
            // Auto-enable startup on first run
            if let Ok(false) = check_auto_startup() {
                if let Ok(message) = setup_auto_startup() {
                    println!("🚀 {}", message);
                }
            }
            
            // Auto-set default printer on startup (with delay to prevent early execution)
            let printer_service = PRINTER_SERVICE.clone();
            tauri::async_runtime::spawn(async move {
                // Wait a bit to ensure the application is fully loaded
                tokio::time::sleep(tokio::time::Duration::from_millis(2000)).await;
                
                let printer_clone = {
                    let printer_guard = printer_service.lock().map_err(|e| e.to_string())?;
                    printer_guard.clone()
                };
                if let Err(e) = printer_clone.auto_set_default_printer().await {
                    println!("⚠️ Failed to auto-set default printer: {}", e);
                }
                Ok::<(), String>(())
            });
            
            // Set up global shortcuts
            let mut shortcut_manager = app.global_shortcut_manager();
            
            // F11 to toggle fullscreen
            let app_handle_f11 = app_handle.clone();
            shortcut_manager
                .register("F11", move || {
                    if let Some(window) = app_handle_f11.get_window("main") {
                        if let Ok(is_fullscreen) = window.is_fullscreen() {
                            let _ = window.set_fullscreen(!is_fullscreen);
                        }
                    }
                })
                .unwrap_or_else(|err| println!("Failed to register F11 shortcut: {}", err));
            
            // Ctrl+Shift+H to hide/show window
            let app_handle_hide = app_handle.clone();
            shortcut_manager
                .register("CommandOrControl+Shift+H", move || {
                    if let Some(window) = app_handle_hide.get_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .unwrap_or_else(|err| println!("Failed to register hide/show shortcut: {}", err));
            
            // Handle window events
            let window = app.get_window("main").unwrap();
            let window_clone = window.clone();
            window.on_window_event(move |event| {
                match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        // Prevent close, hide to tray instead
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                    _ => {}
                }
            });
            
            // Force fullscreen on startup
            let _ = window.set_fullscreen(true);
            let _ = window.set_focus();
            
            // Handle updater events
            app_handle.listen_global("tauri://update-available", move |event| {
                println!("Update available: {:?}", event.payload());
            });
            
            app_handle.listen_global("tauri://update-download-progress", move |event| {
                println!("Update download progress: {:?}", event.payload());
            });
            
            app_handle.listen_global("tauri://update-download-finished", move |event| {
                println!("Update download finished: {:?}", event.payload());
            });
            
            app_handle.listen_global("tauri://update-install", move |event| {
                println!("Update install: {:?}", event.payload());
            });
            
            app_handle.listen_global("tauri://update-error", move |event| {
                println!("Update error: {:?}", event.payload());
            });
            
            println!("🎯 Nqlix started in fullscreen mode with system tray support");
            println!("📋 System tray controls: Left-click to show/hide, Right-click for menu");
            println!("⌨️  Shortcuts: F11 (fullscreen), Ctrl+Shift+H (hide/show)");
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
