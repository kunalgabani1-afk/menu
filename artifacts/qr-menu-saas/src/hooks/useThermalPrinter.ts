import { useState, useCallback, useRef, useEffect } from "react";
import {
  buildKOTBytes,
  buildBillBytes,
  buildTestPrintBytes,
  formatKOTPlainText,
  formatBillPlainText,
  type KOTPrintPayload,
  type BillPrintPayload,
} from "@/lib/escposHelper";

export type PrinterStatus = "disconnected" | "connecting" | "connected" | "printing" | "error";

// Common Thermal Printer Bluetooth GATT Service & Characteristic UUIDs
const KNOWN_PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // Standard ESC/POS
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // ISSC Transparent Serial
  "0000e781-0000-1000-8000-00805f9b34fb", // Xprinter / Zhuhai
  "0000ff00-0000-1000-8000-00805f9b34fb", // Generic POS Service
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // Feasycom BLE POS
];

export interface UseThermalPrinterReturn {
  isSupported: boolean;
  printerStatus: PrinterStatus;
  deviceName: string | null;
  errorMessage: string | null;
  connectPrinter: () => Promise<boolean>;
  disconnectPrinter: () => void;
  printKOT: (ticket: KOTPrintPayload) => Promise<boolean>;
  printBill: (bill: BillPrintPayload) => Promise<boolean>;
  testPrint: () => Promise<boolean>;
  // Simulator State
  isSimulatorOpen: boolean;
  simulatorSlip: string;
  closeSimulator: () => void;
  openSimulatorWithText: (text: string) => void;
}

export function useThermalPrinter(): UseThermalPrinterReturn {
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus>("disconnected");
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Simulator modal state
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [simulatorSlip, setSimulatorSlip] = useState("");

  const bluetoothDeviceRef = useRef<any>(null);
  const writeCharacteristicRef = useRef<any>(null);

  useEffect(() => {
    const supported = typeof navigator !== "undefined" && "bluetooth" in navigator;
    setIsSupported(supported);
  }, []);

  const handleDisconnected = useCallback(() => {
    setPrinterStatus("disconnected");
    setDeviceName(null);
    writeCharacteristicRef.current = null;
    bluetoothDeviceRef.current = null;
  }, []);

  // Connect to Bluetooth Thermal Printer
  const connectPrinter = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setErrorMessage("Web Bluetooth is not supported in this browser. You can use the Thermal Simulator.");
      return false;
    }

    setPrinterStatus("connecting");
    setErrorMessage(null);

    try {
      const nav = navigator as any;
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: KNOWN_PRINTER_SERVICES,
      });

      if (!device) {
        setPrinterStatus("disconnected");
        return false;
      }

      device.addEventListener("gattserverdisconnected", handleDisconnected);
      bluetoothDeviceRef.current = device;
      setDeviceName(device.name || "Thermal Printer");

      // Connect GATT Server
      const server = await device.gatt.connect();

      // Search for any of our known printer services
      let writeChar: any = null;

      for (const serviceUuid of KNOWN_PRINTER_SERVICES) {
        try {
          const service = await server.getPrimaryService(serviceUuid);
          const characteristics = await service.getCharacteristics();
          // Find characteristic with write or writeWithoutResponse property
          for (const char of characteristics) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              writeChar = char;
              break;
            }
          }
          if (writeChar) break;
        } catch {
          // Continue searching other services
        }
      }

      // If known service not matched, query all primary services
      if (!writeChar) {
        try {
          const services = await server.getPrimaryServices();
          for (const service of services) {
            const chars = await service.getCharacteristics();
            for (const char of chars) {
              if (char.properties.write || char.properties.writeWithoutResponse) {
                writeChar = char;
                break;
              }
            }
            if (writeChar) break;
          }
        } catch {
          // ignore
        }
      }

      if (!writeChar) {
        throw new Error("Could not find writable printer channel on this Bluetooth device.");
      }

      writeCharacteristicRef.current = writeChar;
      setPrinterStatus("connected");
      return true;
    } catch (err: any) {
      // User cancelled picker or error
      if (err.name === "NotFoundError" || err.message?.includes("User cancelled")) {
        setPrinterStatus("disconnected");
        return false;
      }
      setPrinterStatus("error");
      setErrorMessage(err.message || "Failed to pair with Bluetooth printer.");
      return false;
    }
  }, [isSupported, handleDisconnected]);

  // Disconnect printer
  const disconnectPrinter = useCallback(() => {
    try {
      if (bluetoothDeviceRef.current && bluetoothDeviceRef.current.gatt.connected) {
        bluetoothDeviceRef.current.gatt.disconnect();
      }
    } catch {
      // ignore
    }
    handleDisconnected();
  }, [handleDisconnected]);

  // Send raw bytes in safe 32-byte chunks to prevent BLE buffer overflow
  const writeBytes = useCallback(async (bytes: Uint8Array): Promise<boolean> => {
    if (!writeCharacteristicRef.current) {
      return false;
    }

    setPrinterStatus("printing");
    const chunkSize = 40; // 40 bytes per MTU frame
    const char = writeCharacteristicRef.current;

    try {
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const slice = bytes.slice(offset, offset + chunkSize);
        if (char.writeValueWithoutResponse) {
          await char.writeValueWithoutResponse(slice);
        } else {
          await char.writeValue(slice);
        }
        // Brief 15ms throttle to let printer hardware buffer flush
        await new Promise((r) => setTimeout(r, 15));
      }
      setPrinterStatus("connected");
      return true;
    } catch (err: any) {
      setPrinterStatus("error");
      setErrorMessage(`Printing failed: ${err.message || "Transfer error"}`);
      return false;
    }
  }, []);

  // Print KOT
  const printKOT = useCallback(
    async (ticket: KOTPrintPayload): Promise<boolean> => {
      const bytes = buildKOTBytes(ticket);
      const textPreview = formatKOTPlainText(ticket);

      // If printer is connected, send bytes wirelessly
      if (writeCharacteristicRef.current && printerStatus === "connected") {
        const success = await writeBytes(bytes);
        if (success) return true;
      }

      // Fallback: Open Visual Thermal Slip Simulator
      setSimulatorSlip(textPreview);
      setIsSimulatorOpen(true);
      return true;
    },
    [printerStatus, writeBytes]
  );

  // Print Bill
  const printBill = useCallback(
    async (bill: BillPrintPayload): Promise<boolean> => {
      const bytes = buildBillBytes(bill);
      const text = formatBillPlainText(bill);

      if (writeCharacteristicRef.current && printerStatus === "connected") {
        const success = await writeBytes(bytes);
        if (success) return true;
      }

      setSimulatorSlip(text);
      setIsSimulatorOpen(true);
      return true;
    },
    [printerStatus, writeBytes]
  );

  // Test Print
  const testPrint = useCallback(async (): Promise<boolean> => {
    const bytes = buildTestPrintBytes();
    if (writeCharacteristicRef.current && printerStatus === "connected") {
      return await writeBytes(bytes);
    }
    setSimulatorSlip(
      [
        "================================",
        "     THERMAL PRINTER TEST       ",
        "         TABLELINE CAFE         ",
        "================================",
        " ( (   Bluetooth Web Link       ",
        "  ) )  Status: ONLINE           ",
        "........                        ",
        "|      |] Ready to print KOT!   ",
        "\\______/                        ",
        "--------------------------------",
        `Time: ${new Date().toLocaleTimeString()}`,
        "ESC/POS 58mm / 80mm Roll Ready  ",
        "================================",
      ].join("\n")
    );
    setIsSimulatorOpen(true);
    return true;
  }, [printerStatus, writeBytes]);

  const closeSimulator = useCallback(() => {
    setIsSimulatorOpen(false);
  }, []);

  const openSimulatorWithText = useCallback((text: string) => {
    setSimulatorSlip(text);
    setIsSimulatorOpen(true);
  }, []);

  return {
    isSupported,
    printerStatus,
    deviceName,
    errorMessage,
    connectPrinter,
    disconnectPrinter,
    printKOT,
    printBill,
    testPrint,
    isSimulatorOpen,
    simulatorSlip,
    closeSimulator,
    openSimulatorWithText,
  };
}
