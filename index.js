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

  // Calcular el total de items
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalWeight = items.reduce((sum, item) => sum + item.grams, 0);
  console.log("Total de items a enviar:", totalItems);
  console.log("Total peso a enviar:", totalWeight);

  try {
    if (!process.env.ID_SESION) {
      console.error("ID_Sesion no está definida en las variables de entorno.");
      return res
        .status(500)
        .json({ error: "ID_Sesion no está definida en el servidor." });
    }
    console.log("Valor de ID_Sesion:", process.env.ID_SESION);

    //verificar barrio
    console.log(
      "Barrio que se envía en la solicitud a wsBarrio:",
      destination.city
    );
    const barrioResponse = await fetch(
      "https://altis-ws.grupoagencia.com:444/JAgencia/JAgencia.asmx/wsBarrio",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ID_Sesion: process.env.ID_SESION,
          Barrrio: destination.city,
        }),
      }
    );

    console.log("Estado de la respuesta de wsBarrio:", barrioResponse.status);
    const barrioData = await barrioResponse.json();
    console.log("Respuesta completa de wsBarrio:", barrioData);

    if (!barrioData.data || barrioData.data.length === 0) {
      console.error(
        "Error en la respuesta de wsBarrio: datos vacíos o no encontrados"
      );
      return res
        .status(400)
        .json({ error: "Datos del barrio no encontrados." });
    }

    const { K_Estado, K_Ciudad, K_Barrio, Codigo_Postal } = barrioData.data[0];
    console.log("Datos extraídos de wsBarrio:", {
      K_Estado,
      K_Ciudad,
      K_Barrio,
      Codigo_Postal,
    });

    let tipo;
    if (totalWeight <= 2000) tipo = "204";
    else if (totalWeight <= 5000) tipo = "139";
    else if (totalWeight <= 10000) tipo = "206";
    else if (totalWeight <= 15000) tipo = "140";
    else if (totalWeight <= 20000) tipo = "207";
    else if (totalWeight <= 25000) tipo = "141";
    else {
      console.error("Peso excede el límite máximo de 25kg.");
      return res
        .status(400)
        .json({ error: "El peso total excede el límite permitido de 25kg." });
    }

    const Detalle_Paquetes = JSON.stringify([
      { Tipo: tipo, Cantidad: totalItems },
    ]);

    const body = {
      ID_Sesion: process.env.ID_SESION,
      K_Cliente_Remitente: 730738,
      K_Cliente_Destinatario: 5,
      K_Barrio: K_Barrio,
      K_Ciudad_Destinatario: K_Ciudad,
      K_Estado_Destinatario: K_Estado,
      K_Pais_Destinatario: 1,
      CP_Destinatario: Codigo_Postal,
      Direccion_Destinatario: "Soromio 4232",
      Detalle_Paquetes: Detalle_Paquetes,
      K_Oficina_Destino: 0,
      K_Tipo_Envio: 1,
      Entrega: 2,
      Paquetes_Ampara: totalItems,
      K_Tipo_Guia: 2,
      usaBolsa: 0,
      esRecoleccion: 0,
    };

    console.log("Cuerpo de la solicitud a wsObtieneCosto:", body);

    const response = await fetch(
      "https://altis-ws.grupoagencia.com:444/JAgencia/JAgencia.asmx/wsObtieneCosto_Nuevo",
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
