import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { text, audio, history = [] } = body;

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GROQ_API_KEY no configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
      },
    );

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Sesión inválida" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get usuario profile
    const { data: usuario } = await supabase
      .from("usuarios")
      .select("id, rol, nombre")
      .eq("auth_id", user.id)
      .maybeSingle();

    if (!usuario || usuario.rol !== "pmo") {
      return new Response(
        JSON.stringify({ error: "Solo la PMO puede usar el asistente" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let transcribedText = text;

    // Step 1: Speech-to-Text (if audio provided)
    if (audio && !text) {
      const audioBytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
      const audioBlob = new Blob([audioBytes], { type: "audio/webm" });
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");
      formData.append("model", "whisper-large-v3");
      formData.append("language", "es");

      const sttResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        body: formData,
      });

      if (!sttResponse.ok) {
        const errText = await sttResponse.text();
        return new Response(
          JSON.stringify({ error: `Error de transcripción: ${sttResponse.status}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const sttData = await sttResponse.json();
      transcribedText = sttData.text;
    }

    if (!transcribedText || transcribedText.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "No se detectó texto" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 2: LLM with tool calling
    const tools = [
      {
        type: "function",
        function: {
          name: "consultar_estado_consultor",
          description: "Consulta el estado de un consultor: tareas activas, atrasadas, horas registradas",
          parameters: {
            type: "object",
            properties: {
              nombre_consultor: { type: "string", description: "Nombre del consultor" },
            },
            required: ["nombre_consultor"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "consultar_estado_proyecto",
          description: "Consulta el estado de un proyecto: progreso, costo real vs estimado, tareas atrasadas",
          parameters: {
            type: "object",
            properties: {
              nombre_proyecto: { type: "string", description: "Nombre del proyecto" },
            },
            required: ["nombre_proyecto"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "listar_tareas_atrasadas",
          description: "Lista todas las tareas atrasadas, opcionalmente filtradas por proyecto",
          parameters: {
            type: "object",
            properties: {
              proyecto: { type: "string", description: "Nombre del proyecto (opcional)" },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "listar_pendientes_por_registrar",
          description: "Lista qué falta por registrar: proyectos sin actividad reciente, reportes faltantes",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function",
        function: {
          name: "crear_tarea",
          description: "Crea una nueva tarea en un proyecto",
          parameters: {
            type: "object",
            properties: {
              proyecto: { type: "string", description: "Nombre del proyecto" },
              nombre: { type: "string", description: "Nombre de la tarea" },
              asignado: { type: "string", description: "Nombre del consultor asignado (opcional)" },
              fecha_limite: { type: "string", description: "Fecha límite YYYY-MM-DD (opcional)" },
              prioridad: { type: "string", enum: ["baja", "media", "alta", "urgente"], description: "Prioridad (opcional)" },
            },
            required: ["proyecto", "nombre"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "actualizar_estado_tarea",
          description: "Actualiza el estado de una tarea",
          parameters: {
            type: "object",
            properties: {
              tarea: { type: "string", description: "Nombre de la tarea" },
              nuevo_estado: { type: "string", enum: ["no_iniciado", "en_progreso", "en_espera", "hecho"], description: "Nuevo estado" },
            },
            required: ["tarea", "nuevo_estado"],
          },
        },
      },
    ];

    const systemPrompt = `Eres el asistente de Pulsesoft, un sistema de gestión de proyectos para una PMO. Responde en español, de forma concisa y clara. Tienes acceso a herramientas para consultar y modificar datos del sistema. Usa las herramientas cuando sea necesario para responder preguntas o ejecutar acciones. El usuario actual es: ${usuario.nombre} (PMO).`;

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: systemPrompt },
      ...((history as ChatMessage[]).map((m) => ({ role: m.role, content: m.content }))),
      { role: "user", content: transcribedText },
    ];

    let llmResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!llmResponse.ok) {
      const errText = await llmResponse.text();
      return new Response(
        JSON.stringify({ error: `Error del LLM: ${llmResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let llmData = await llmResponse.json();
    let choice = llmData.choices[0];
    let toolResults: string[] = [];

    // Handle tool calls (up to 3 rounds)
    for (let round = 0; round < 3; round++) {
      if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) break;

      messages.push(choice.message);

      for (const toolCall of choice.message.tool_calls) {
        const fnName = toolCall.function.name;
        const fnArgs = JSON.parse(toolCall.function.arguments);
        let result = "";

        try {
          result = await executeTool(fnName, fnArgs, supabase);
        } catch (err) {
          result = `Error: ${err.message}`;
        }

        toolResults.push(`${fnName}: ${result}`);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      // Second LLM call with tool results
      llmResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages,
          temperature: 0.7,
          max_tokens: 1024,
        }),
      });

      if (!llmResponse.ok) break;
      llmData = await llmResponse.json();
      choice = llmData.choices[0];
    }

    const assistantText = choice.message.content || "No pude procesar la solicitud.";

    // Step 3: Text-to-Speech
    let audioBase64 = null;
    try {
      const ttsResponse = await fetch("https://api.groq.com/openai/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "playai-tts",
          voice: "Fritz-PlayAI",
          input: assistantText,
          response_format: "wav",
        }),
      });

      if (ttsResponse.ok) {
        const audioBuffer = await ttsResponse.arrayBuffer();
        const bytes = new Uint8Array(audioBuffer);
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, Array.from(chunk));
        }
        audioBase64 = btoa(binary);
      }
    } catch {
      // TTS is optional
    }

    return new Response(
      JSON.stringify({
        text: assistantText,
        transcribed_text: audio ? transcribedText : undefined,
        audio: audioBase64,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function executeTool(name: string, args: Record<string, unknown>, supabase: ReturnType<typeof createClient>): Promise<string> {
  switch (name) {
    case "consultar_estado_consultor": {
      const nombre = args.nombre_consultor as string;
      const { data } = await supabase
        .from("vw_carga_consultor")
        .select("*")
        .ilike("nombre", `%${nombre}%`)
        .maybeSingle();
      if (!data) return `No se encontró al consultor: ${nombre}`;
      return `${data.nombre} (${data.rol}): ${data.tareas_asignadas_activas} tareas activas, ${data.tareas_atrasadas} atrasadas, ${Number(data.horas_registradas_totales).toFixed(1)} horas registradas.`;
    }

    case "consultar_estado_proyecto": {
      const nombre = args.nombre_proyecto as string;
      const { data } = await supabase
        .from("vw_proyecto_resumen")
        .select("*")
        .ilike("nombre", `%${nombre}%`)
        .maybeSingle();
      if (!data) return `No se encontró el proyecto: ${nombre}`;
      return `Proyecto ${data.nombre}: ${Math.round(Number(data.progreso_pct))}% completado, ${data.total_tareas} tareas (${data.tareas_completadas} hechas, ${data.tareas_atrasadas} atrasadas). Costo real: $${Number(data.costo_real_total).toFixed(2)} de $${Number(data.valor_estimado || 0).toFixed(2)} estimado.`;
    }

    case "listar_tareas_atrasadas": {
      const proyecto = args.proyecto as string | undefined;
      let query = supabase
        .from("tareas")
        .select("nombre, fecha_limite, proyectos(nombre)")
        .lt("fecha_limite", new Date().toISOString().split("T")[0])
        .neq("estado", "hecho");
      if (proyecto) {
        const { data: proy } = await supabase.from("proyectos").select("id").ilike("nombre", `%${proyecto}%`).maybeSingle();
        if (proy) query = query.eq("proyecto_id", proy.id);
      }
      const { data } = await query.order("fecha_limite", { ascending: true }).limit(20);
      if (!data || data.length === 0) return "No hay tareas atrasadas.";
      return data.map((t: Record<string, unknown>) => {
        const projName = (t.proyectos as Record<string, string>)?.nombre ?? "";
        return `- ${t.nombre} (${projName}) — vencía ${t.fecha_limite}`;
      }).join("\n");
    }

    case "listar_pendientes_por_registrar": {
      const { data: proyectos } = await supabase
        .from("vw_proyecto_resumen")
        .select("*")
        .neq("estado", "completado")
        .order("progreso_pct", { ascending: true })
        .limit(10);
      if (!proyectos || proyectos.length === 0) return "Todo al día.";
      return "Proyectos con menor avance:\n" + proyectos.map((p: Record<string, unknown>) => `- ${p.nombre}: ${Math.round(Number(p.progreso_pct))}% (${p.tareas_atrasadas} atrasadas)`).join("\n");
    }

    case "crear_tarea": {
      const { data: proy } = await supabase
        .from("proyectos")
        .select("id")
        .ilike("nombre", `%${args.proyecto}%`)
        .maybeSingle();
      if (!proy) return `No se encontró el proyecto: ${args.proyecto}`;
      const insertData: Record<string, unknown> = {
        proyecto_id: proy.id,
        nombre: args.nombre,
        prioridad: args.prioridad ?? "media",
      };
      if (args.fecha_limite) insertData.fecha_limite = args.fecha_limite;
      const { data, error } = await supabase.from("tareas").insert(insertData).select("id").single();
      if (error) return `Error al crear tarea: ${error.message}`;
      if (args.asignado) {
        const { data: user } = await supabase.from("usuarios").select("id").ilike("nombre", `%${args.asignado}%`).maybeSingle();
        if (user) {
          await supabase.from("tarea_asignados").insert({ tarea_id: data.id, usuario_id: user.id });
        }
      }
      return `Tarea "${args.nombre}" creada en ${args.proyecto}.`;
    }

    case "actualizar_estado_tarea": {
      const { data: tarea } = await supabase
        .from("tareas")
        .select("id, nombre")
        .ilike("nombre", `%${args.tarea}%`)
        .maybeSingle();
      if (!tarea) return `No se encontró la tarea: ${args.tarea}`;
      const { error } = await supabase.from("tareas").update({ estado: args.nuevo_estado }).eq("id", tarea.id);
      if (error) return `Error: ${error.message}`;
      return `Tarea "${tarea.nombre}" marcada como ${args.nuevo_estado}.`;
    }

    default:
      return `Función desconocida: ${name}`;
  }
}
