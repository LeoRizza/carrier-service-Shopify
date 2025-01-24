import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import nodemailer from "nodemailer";
import {} from "dotenv/config";

const app = express();
app.use(bodyParser.json());

//funcion enviar pegote
const enviarEmailConPegote = async (Pegote) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER, // Email configurado en .env
        pass: process.env.EMAIL_PASS, // Contraseña de aplicación configurada en .env
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: "selftech.agency@gmail.com",
      subject: "Nueva Etiqueta Generada",
      text: `Aquí tienes el código base64 de la etiqueta:\n\n${Pegote}`,
    };

    await transporter.sendMail(mailOptions);
    console.log("Correo enviado exitosamente.");
  } catch (error) {
    console.error("Error al enviar el correo:", error);
  }
};

// Función para obtener datos de barrio y ciudad
const obtenerDatosBarrio = async (city) => {
  const response = await fetch(
    "https://altis-ws.grupoagencia.com:444/JAgencia/JAgencia.asmx/wsBarrio",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ID_Sesion: process.env.ID_SESION,
        Barrrio: city,
      }),
    }
  );

  const barrioData = await response.json();
  if (!barrioData.data || barrioData.data.length === 0) {
    throw new Error("Datos del barrio no encontrados.");
  }

  return barrioData.data[0]; // Devuelve K_Estado, K_Ciudad, K_Barrio, Codigo_Postal
};

// Función para determinar el tipo de paquete según el peso
const calcularTipoPaquete = (totalWeight) => {
  if (totalWeight <= 2000) return "204";
  if (totalWeight <= 5000) return "139";
  if (totalWeight <= 10000) return "206";
  if (totalWeight <= 15000) return "140";
  if (totalWeight <= 20000) return "207";
  if (totalWeight <= 25000) return "141";
  throw new Error("El peso total excede el límite permitido de 25kg.");
};

// Endpoint para cotización de envíos
app.post("/shipping-rates", async (req, res) => {
  try {
    const { rate } = req.body;

    if (!rate || !rate.billing_address || !rate.items) {
      return res.status(400).json({ error: "Faltan datos para cotización." });
    }

    const { billing_address, items } = rate;
    const totalWeight = items.reduce((sum, item) => sum + item.grams, 0);
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

    console.log("Cotizando envío para:", billing_address.city);

    // Obtener datos del barrio
    const { K_Estado, K_Ciudad, K_Barrio, Codigo_Postal } =
      await obtenerDatosBarrio(billing_address.city);
    console.log("Datos de barrio obtenidos:", {
      K_Estado,
      K_Ciudad,
      K_Barrio,
      Codigo_Postal,
    });

    const tipo = calcularTipoPaquete(totalWeight);
    const Detalle_Paquetes = JSON.stringify([
      { Tipo: tipo, Cantidad: totalItems },
    ]);

    const cotizacionBody = {
      ID_Sesion: process.env.ID_SESION,
      K_Cliente_Remitente: 730738,
      K_Cliente_Destinatario: 5,
      K_Barrio: K_Barrio,
      K_Ciudad_Destinatario: K_Ciudad,
      K_Estado_Destinatario: K_Estado,
      K_Pais_Destinatario: 1,
      CP_Destinatario: Codigo_Postal,
      Direccion_Destinatario: billing_address.address1,
      Detalle_Paquetes: Detalle_Paquetes,
      K_Oficina_Destino: "",
      K_Tipo_Envio: 4,
      Entrega: 2,
      Paquetes_Ampara: totalItems,
      K_Tipo_Guia: 2,
      usaBolsa: "",
      esRecoleccion: "",
    };

    console.log("Solicitando cotización con datos:", cotizacionBody);

    const response = await fetch(
      "https://altis-ws.grupoagencia.com:444/JAgencia/JAgencia.asmx/wsObtieneCosto_Nuevo",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cotizacionBody),
      }
    );

    const data = await response.json();

    if (data.result !== 0) {
      throw new Error("Error en la cotización de tarifas.");
    }

    res.json({
      rates: [
        {
          service_name: "DAC Express",
          service_code: "DAC",
          total_price: data.data.Total_Guia * 100,
          currency: "UYU",
          min_delivery_date: new Date().toISOString(),
          max_delivery_date: new Date(
            Date.now() + 5 * 24 * 60 * 60 * 1000
          ).toISOString(),
        },
      ],
    });
  } catch (error) {
    console.error("Error al cotizar envío:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para crear el envío
app.post("/create", async (req, res) => {
  try {
    const order = req.body;
    console.log("Body de webhook:", order);

    const { K_Estado, K_Ciudad, K_Barrio, Codigo_Postal } =
      await obtenerDatosBarrio(order.shipping_address.city);
    console.log("Datos de barrio para envío:", {
      K_Estado,
      K_Ciudad,
      K_Barrio,
      Codigo_Postal,
    });

    const totalWeight = order.line_items.reduce(
      (sum, item) => sum + item.grams,
      0
    );
    const tipo = calcularTipoPaquete(totalWeight);
    const totalItems = order.line_items.reduce(
      (sum, item) => sum + item.quantity,
      0
    );
    const CodigoPedido = `${order.id}`;

    const envioBody = {
      ID_Sesion: "OTkwOTA0NjEzMDMzODI0SmFuMjAyNTAwOjE4OjQ2OjM0MA==",
      K_Cliente_Remitente: 730738,
      D_Cliente_Remitente: "THREE HOUSE DECO",
      K_Cliente_Destinatario: 5,
      Cliente_Destinatario: order.shipping_address.name,
      RUT: 218717110015,
      Direccion_Destinatario: order.shipping_address.address1,
      K_Barrio: K_Barrio,
      K_Ciudad_Destinatario: K_Ciudad,
      K_Estado_Destinatario: K_Estado,
      K_Pais_Destinatario: 1,
      CP_Destinatario: Codigo_Postal,
      Telefono: order.shipping_address.phone || "",
      K_Oficina_Destino: "",
      Entrega: 2,
      Paquetes_Ampara: totalItems,
      Detalle_Paquetes: JSON.stringify([{ Tipo: tipo, Cantidad: totalItems }]),
      Observaciones: "Pedido desde Shopify",
      K_Tipo_Guia: 2,
      K_Tipo_Envio: 4,
      CostoMercaderia: "",
      Referencia_Pago: "",
      CodigoPedido: CodigoPedido,
      Serv_Cita: "",
      Latitud_Destino: "",
      Longitud_Destino: "",
      Serv_DDF: "",
    };

    console.log("Enviando datos de envío:", envioBody);

    // Solicitud de creación de envío
    const envioResponse = await fetch(
      "https://altis-ws.grupoagencia.com:444/JAgencia/JAgencia.asmx/wsInGuia_Nuevo",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envioBody),
      }
    );

    const trackingInfo = await envioResponse.json();

    if (trackingInfo.result !== 0) {
      throw new Error("Error al crear el envío");
    }

    // Generar sticker usando la API wsGetPegote
    const pegoteRequestBody = {
      K_Oficina: "",
      K_Guia: "",
      ID_Sesion: process.env.ID_SESION,
      CodigoPedido: CodigoPedido,
    };

    const pegoteResponse = await fetch(
      "https://altis-ws.grupoagencia.com:444/JAgencia/JAgencia.asmx/wsGetPegote",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pegoteRequestBody),
      }
    );

    const pegoteData = await pegoteResponse.json();

    if (pegoteData.result !== 0) {
      throw new Error("Error al obtener el sticker");
    }

    // Extraer el valor de Pegote (código base64 de la imagen)
    const { Pegote } = pegoteData.data;

    console.log("pegote", Pegote);
    await enviarEmailConPegote(Pegote);

    // Enviar respuesta final con toda la información
    res.status(200).json({
      message: "Envío creado exitosamente.",
      trackingInfo,
      sticker: Pegote,
    });
  } catch (error) {
    console.error("Error al crear el envío:", error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

export default app;
