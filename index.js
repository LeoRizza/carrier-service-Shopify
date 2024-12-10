import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import {} from "dotenv/config";

const app = express();
app.use(bodyParser.json());

app.post("/shipping-rates", async (req, res) => {
  const { rate } = req.body;

  console.log("Solicitud recibida de Shopify:", req.body);

  if (!rate) {
    console.error("No se recibió la información de la tarifa.");
    return res
      .status(400)
      .json({ error: "No se recibió la información de la tarifa." });
  }

  // Extraer los datos necesarios de la solicitud de Shopify
  const { origin, destination, items } = rate;

  if (!origin || !destination || !items) {
    console.error("Faltan datos necesarios para calcular las tarifas.");
    return res
      .status(400)
      .json({ error: "Faltan datos necesarios para calcular las tarifas." });
  }

  try {
    // Consultar barrio utilizando la ciudad del destino
    const barrioResponse = await fetch(
      "https://altis-ws.grupoagencia.com:444/JAgencia/JAgencia.asmx/wsBarrio",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ID_Sesion: process.env.ID_SESION,
          Barrio: destination.city,
        }),
      }
    );

    const barrioData = await barrioResponse.json();
    console.log("Respuesta de wsBarrio:", barrioData);

    if (!barrioData.data || barrioData.data.length === 0) {
      console.error(
        "Error en la respuesta de wsBarrio: datos vacíos o no encontrados"
      );
      return res
        .status(400)
        .json({ error: "Datos del barrio no encontrados." });
    }

    const { K_Estado, K_Ciudad, K_Barrio, Codigo_Postal } = barrioData.data[0];

    // Preparar los parámetros necesarios para la API de DAC
    const body = {
      ID_Sesion: process.env.ID_SESION,
      K_Cliente_Remitente: 730738,
      K_Cliente_Destinatario: 5,
      K_Barrio,
      K_Ciudad_Destinatario: K_Ciudad,
      K_Estado_Destinatario: K_Estado,
      K_Pais_Destinatario: 1,
      CP_Destinatario: Codigo_Postal,
      K_Oficina_Destino: 0,
      Entrega: 0,
      Paquetes_Ampara: 0,
      Chicos: 0,
      Medianos: 0,
      Grandes: 0,
      Extragrande: 0,
      Cartas: 0,
      Sobres: 0,
      K_Tipo_Guia: 4,
      K_Articulo: 28,
      CostoMercaderia: "",
      esRecoleccion: 0,
    };

    console.log("Cuerpo de la solicitud a wsObtieneCosto:", body);

    // Llamada a la API de DAC para calcular las tarifas
    const response = await fetch(
      "https://altis-ws.grupoagencia.com:444/JAgencia/JAgencia.asmx/wsObtieneCosto",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();
    console.log("Respuesta de wsObtieneCosto:", data);

    if (data.result !== 0) {
      console.error("Error al calcular tarifas:", data);
      return res.status(500).json({ error: "Error al calcular tarifas." });
    }

    // Extraer Total_Guia de la respuesta
    const totalGuia = data.data.Total_Guia;

    // Devuelve las tarifas al checkout de Shopify
    res.json({
      rates: [
        {
          service_name: "DAC Express",
          service_code: "DAC",
          total_price: totalGuia * 100, // Total en centavos
          currency: "UYU",
          min_delivery_date: new Date().toISOString(),
          max_delivery_date: new Date(
            Date.now() + 5 * 24 * 60 * 60 * 1000
          ).toISOString(),
        },
      ],
    });
  } catch (error) {
    console.error("Error al calcular tarifas:", error);
    res.status(500).json({ error: "Error al calcular tarifas." });
  }
});

export default app;
