import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, Power, Activity, Send } from 'lucide-react';
import { arrayBufferToBase64, float32To16BitPCM, decodeAudioData, base64ToUint8Array, downsampleTo16k } from '../utils/audio';
import PaintOrb, { type OrbMode } from './PaintOrb';
import type { User } from '../types';
import { api } from '../api';
import { EVENTO, type Sede } from '../config/sedes';


interface AdiAssistantProps {
  user: User;
  sede: Sede;
}

// Regex patterns to detect farewells in speech and transcription
const ADI_FAREWELL_REGEX = /\b(adi[oó]s|hasta luego|hasta pronto|nos vemos en|que disfrute(?:s)?|un placer atenderle|un gusto atenderle|ha sido un placer|ha sido un gusto|fue un placer|con gusto,? hasta luego|que tenga un(?:a)? excelente|chao|bye)\b/i;
const USER_FAREWELL_REGEX = /\b(adi[oó]s|hasta luego|hasta pronto|nos vemos|bye|chao|eso es todo|muchas gracias por todo|muchas gracias|muchas gracias adi)\b/i;

const AdiAssistant: React.FC<AdiAssistantProps> = ({ user, sede }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isError, setIsError] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [userTranscript, setUserTranscript] = useState('');
  const [adiTranscript, setAdiTranscript] = useState('');
  const [isListeningSpeech, setIsListeningSpeech] = useState(false);
  const [isFarewellClosing, setIsFarewellClosing] = useState(false);
  
  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const levelBufRef = useRef<Uint8Array | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const newAdiTurnRef = useRef<boolean>(true);
  const newUserTurnRef = useRef<boolean>(true);
  
  // Playback Refs
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const speakingTimeoutRef = useRef<number | null>(null);
  
  // State Refs for rapid audio processing
  const isSpeakingRef = useRef<boolean>(false);
  const isUserSpeakingRef = useRef<boolean>(false);
  const activeSessionRef = useRef<any>(null);
  const speechRecognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const pendingTranscriptRef = useRef<string>('');
  const voiceHangoverRef = useRef<number>(0);

  // Farewell and Auto-Shutdown Refs
  const isInitialGreetingDoneRef = useRef<boolean>(false);
  const farewellDetectedRef = useRef<boolean>(false);
  const currentAdiTurnTextRef = useRef<string>('');
  const isFarewellShutdownRef = useRef<boolean>(false);

  // Activity Watchdog: Ensures Adi turns off after the user stops interacting
  const hasUserInteractedRef = useRef<boolean>(false);
  const lastActivityTimeRef = useRef<number>(Date.now());
  const disconnectRef = useRef<() => void>(() => {});

  const markUserActivity = useCallback(() => {
    hasUserInteractedRef.current = true;
    lastActivityTimeRef.current = Date.now();
  }, []);

  // Instrucción de sistema: se arma con los datos de la sede (config/sedes.ts)
  const getSystemInstruction = () => {
    const lineas = sede.lineas.length
      ? `En esta sede las líneas terapéuticas del Salón 2 son: ${sede.lineas.join(' y ')}. Cada línea tiene su propio color, luz y aroma.`
      : 'Las líneas terapéuticas de esta sede se darán a conocer muy pronto; su representante de Adium le compartirá el detalle.';
    const ponentes = sede.ponentes.length
      ? sede.ponentes.map((p) => `- ${p.nombre}${p.especialidad ? `, ${p.especialidad}` : ''}${p.tema ? `: "${p.tema}"` : ''}`).join('\n') +
        '\nNo agregue títulos, especialidades ni currículum que no estén en esta lista.'
      : 'La agenda académica con los nombres de los ponentes la compartirá su representante de Adium. NO invente ni mencione nombres de ponentes.';
    const estacionamiento = sede.estacionamiento
      ? sede.estacionamiento
      : 'Aún no está confirmado si el estacionamiento tiene costo. Si le preguntan, diga que su representante de Adium se lo confirmará. NO diga que es gratuito.';
    const agenda = sede.agenda.map((b) => `${b.hora} · ${b.titulo}${b.quien ? ` (${b.quien})` : ''}`).join('\n');

    return `
IDENTIDAD Y ROL:
Su nombre es ${EVENTO.anfitriona}. Es la anfitriona de "${EVENTO.nombre}", una mañana de actualización médica de ${EVENTO.marca} en ${sede.ciudad}.
Personalidad: cálida, clara, elegante y muy accesible. Habla con médicos, siempre de "usted".
Concepto del evento (úselo con naturalidad, sin repetirlo en cada respuesta): "${EVENTO.concepto}". La vitamina D nace con el sol; la mañana se cuenta en tres momentos: Amanecer, Espectro y Mediodía.

ESTILO CONVERSACIONAL:
- Responda en 1 o 2 oraciones breves (idealmente menos de 25 palabras). Nada de monólogos.
- Si solo escucha ruido, una respiración o una sílaba suelta ("eh", "ah", "mm"), NO responda.
- Si no sabe algo, dígalo con amabilidad y sugiera consultarlo con su representante de Adium. Nunca invente datos.

SALUDO INICIAL:
Salude al doctor o doctora por su nombre ("${user.name}"), confírmele su lugar en Vital D ${sede.ciudad} y mencione que su boleto con código QR está un poco más abajo en esta página y también le llegó por correo.

DESPEDIDA (CRÍTICO):
Cuando el usuario se despida ("adiós", "gracias", "eso es todo", "hasta luego", "nos vemos"), despídase en una sola oración cálida y termine SIEMPRE con "¡Hasta luego!", "¡Adiós!" o "¡Nos vemos en el evento!".

DATOS DEL EVENTO (lo único que usted sabe; no agregue nada más):
1. FECHA Y HORA: ${sede.fechaTexto}. Cita a las ${sede.hora} para registro y desayuno. Termina aproximadamente a las ${sede.horaFin}. Le pedimos llegar puntual.
2. SEDE: ${sede.hotel}. ${sede.direccion}. El mapa y el botón para abrir la ruta están al final de esta página.
3. AGENDA:
${agenda}
   ${sede.formato}
4. LÍNEAS: ${lineas}
5. PONENTES:
${ponentes}
6. ESTACIONAMIENTO: ${estacionamiento}
7. ACCESO: El registro es personal e intransferible y el cupo es de ${sede.cupoPublico} médicos. No es posible llevar acompañantes ni registrar invitados adicionales en este enlace. Debe presentar su código QR al llegar.
8. ALIMENTOS: Hay desayuno al inicio y coffee break antes del cierre.

LÍMITES (COMPLIANCE):
- No dé recomendaciones clínicas, dosis ni información de productos o medicamentos. Si le preguntan, diga que esos temas se abordarán con los ponentes durante el evento o con su representante de Adium.
- No hable de precios, patrocinios ni temas ajenos al evento.
`;
  };

  // Send a user question or text turn directly to the live session
  const sendUserQuestion = useCallback((questionText: string) => {
    const text = questionText.trim();
    if (!text || !activeSessionRef.current) return;

    markUserActivity();
    setUserTranscript(text);
    setAdiTranscript('');
    currentAdiTurnTextRef.current = '';

    if (isInitialGreetingDoneRef.current && USER_FAREWELL_REGEX.test(text)) {
      console.log('Despedida de usuario detectada en texto:', text);
      farewellDetectedRef.current = true;
    }

    try {
      activeSessionRef.current.sendClientContent({
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true
      });
    } catch (err) {
      console.warn('Error sending client content:', err);
    }
  }, [markUserActivity]);

  const initializeAudio = async () => {
    if (isConnecting || isConnected) return;

    try {
      setIsConnecting(true);
      setIsError(false);
      setUserTranscript('');
      setAdiTranscript('');
      setIsFarewellClosing(false);
      hasUserInteractedRef.current = false;
      lastActivityTimeRef.current = Date.now();
      isInitialGreetingDoneRef.current = false;
      farewellDetectedRef.current = false;
      isFarewellShutdownRef.current = false;
      currentAdiTurnTextRef.current = '';
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;

      // La entrada se abre a la tasa nativa del dispositivo y se baja a 16 kHz en código:
      // Firefox no permite conectar el micrófono a un contexto de otra tasa, y en iOS
      // la tasa forzada a veces deja el micrófono en silencio.
      const inputCtx = new AudioContextClass();
      inputAudioContextRef.current = inputCtx;

      // Analizador de la voz de Adi: alimenta la animación de pintura
      const analyser = outputCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      analyser.connect(outputCtx.destination);
      outputAnalyserRef.current = analyser;
      levelBufRef.current = new Uint8Array(analyser.fftSize);

      // Ensure browser audio contexts are actively running
      if (outputCtx.state === 'suspended') {
        await outputCtx.resume();
      }
      if (inputCtx.state === 'suspended') {
        await inputCtx.resume();
      }
      
      // Request mic with echo cancellation & noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      mediaStreamRef.current = stream;
      
      // Token temporal: la clave de Gemini se queda en el Apps Script
      const tk = await api.liveToken(user.id);
      if (!tk.success || !tk.token) throw new Error(tk.message || 'Sin token de Gemini');
      const ai = new GoogleGenAI({ apiKey: tk.token, httpOptions: { apiVersion: tk.apiVersion || 'v1alpha' } });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-3.1-flash-live-preview',
        callbacks: {
          onopen: () => {
            console.log('Gemini Live Connection Opened');
            setIsConnected(true);
            setIsConnecting(false);
            setIsError(false);
            lastActivityTimeRef.current = Date.now();
          },
          onmessage: async (message: LiveServerMessage) => {
            try {
              // Check for setupComplete to trigger immediate warm greeting
              if ((message as any).setupComplete) {
                console.log('Setup complete, triggering opening greeting...');
                setTimeout(() => {
                  sessionPromiseRef.current?.then((session) => {
                    try {
                      session.sendClientContent({
                        turns: [{
                          role: 'user',
                          parts: [{ text: `Hola Adi, acabo de confirmar mi asistencia. Salúdame por mi nombre y dame la bienvenida a Vital D ${sede.ciudad} brevemente.` }]
                        }],
                        turnComplete: true
                      });
                    } catch (err) { console.warn('No se pudo enviar el saludo', err); }
                  });
                }, 250);
              }

              // Realtime model transcription (subtitles)
              const textPart = (message.serverContent as any)?.outputTranscription?.text || 
                               message.serverContent?.modelTurn?.parts?.[0]?.text;
              if (textPart) {
                if (newAdiTurnRef.current) {
                  newAdiTurnRef.current = false;
                  currentAdiTurnTextRef.current = '';
                  setAdiTranscript(textPart);
                } else {
                  setAdiTranscript(prev => prev + textPart);
                }
                currentAdiTurnTextRef.current += textPart;

                if (isInitialGreetingDoneRef.current && ADI_FAREWELL_REGEX.test(currentAdiTurnTextRef.current)) {
                  console.log('Adi pronunció despedida en vivo:', currentAdiTurnTextRef.current);
                  farewellDetectedRef.current = true;
                  setIsFarewellClosing(true);
                }
              }

              // User speech transcription from Gemini Live
              const userTextPart = (message.serverContent as any)?.inputTranscription?.text;
              if (userTextPart) {
                markUserActivity();
                if (newUserTurnRef.current) {
                  newUserTurnRef.current = false;
                  setUserTranscript(userTextPart);
                } else {
                  setUserTranscript(prev => prev ? `${prev}${userTextPart}` : userTextPart);
                }
                if (isInitialGreetingDoneRef.current && USER_FAREWELL_REGEX.test(userTextPart)) {
                  console.log('Despedida de usuario detectada en inputTranscription:', userTextPart);
                  farewellDetectedRef.current = true;
                }
              }

              const audioParts = (message.serverContent?.modelTurn?.parts || [])
                .map((p: any) => p?.inlineData?.data)
                .filter(Boolean) as string[];

              for (const base64Audio of audioParts) {
                if (!audioContextRef.current) break;
                lastActivityTimeRef.current = Date.now();
                const ctx = audioContextRef.current;
                
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                
                const audioBytes = base64ToUint8Array(base64Audio);
                const audioBuffer = await decodeAudioData(audioBytes, ctx, 24000, 1);
                
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputAnalyserRef.current || ctx.destination);
                
                source.addEventListener('ended', () => {
                  sourcesRef.current.delete(source);
                  if (sourcesRef.current.size === 0) {
                    if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
                    speakingTimeoutRef.current = window.setTimeout(() => {
                      setIsSpeaking(false);
                      isSpeakingRef.current = false;
                      lastActivityTimeRef.current = Date.now();

                      // If this was the initial welcome greeting, mark it done
                      if (!isInitialGreetingDoneRef.current) {
                        isInitialGreetingDoneRef.current = true;
                        currentAdiTurnTextRef.current = '';
                        return;
                      }

                      // If a farewell was detected during this exchange, power off after audio playback finishes!
                      if (farewellDetectedRef.current && !isFarewellShutdownRef.current) {
                        isFarewellShutdownRef.current = true;
                        setIsFarewellClosing(true);
                        console.log('Adi finalizó su despedida. Apagando asistente en 1 segundo.');
                        window.setTimeout(() => {
                          disconnectRef.current();
                        }, 1200);
                      } else {
                        currentAdiTurnTextRef.current = '';
                      }
                    }, 120); 
                  }
                });
                
                if (speakingTimeoutRef.current) {
                  clearTimeout(speakingTimeoutRef.current);
                  speakingTimeoutRef.current = null;
                }
                setIsSpeaking(true);
                isSpeakingRef.current = true;

                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
              }

              if (message.serverContent?.turnComplete) {
                newAdiTurnRef.current = true;
                newUserTurnRef.current = true;
              }

              if (message.serverContent?.interrupted) {
                sourcesRef.current.forEach(s => {
                  try { s.stop(); } catch (_) {}
                });
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
                setIsSpeaking(false);
                isSpeakingRef.current = false;
                lastActivityTimeRef.current = Date.now();
              }
            } catch (err) {
              console.error('Error handling live message:', err);
            }
          },
          onclose: (e: any) => {
            console.log('Gemini Live Connection Closed:', e?.code, e?.reason);
            activeSessionRef.current = null;
            disconnectRef.current();
          },
          onerror: (e: any) => {
            console.error('Gemini Live Error:', e);
            setIsError(true);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: getSystemInstruction(),
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } }
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;
      sessionPromise.then(session => {
        activeSessionRef.current = session;
      }).catch(err => {
        console.error("Failed to connect live session", err);
        setIsError(true);
        setIsConnecting(false);
      });

      // Browser Native Speech Recognition for Zero-Latency Endpointing
      const isMeaningfulSpeech = (text: string) => {
        const clean = text.trim().toLowerCase().replace(/[^a-záéíóúñ0-9\s]/gi, '');
        const words = clean.split(/\s+/).filter(Boolean);
        if (words.length === 0) return false;
        
        // Single filler words or breath/noise sounds picked up by browser recognition
        const noiseTokens = new Set([
          'a', 'e', 'i', 'o', 'u', 'y', 'ah', 'eh', 'oh', 'uh', 'um', 'mm', 'hmm', 
          'sh', 'ay', 'ha', 'he', 'ok', 'de', 'el', 'la', 'los', 'las', 'un', 'una', 
          'si', 'sí', 'ya', 'no'
        ]);

        // If it's a single word, it must not be in noiseTokens and must be at least 3 characters long (e.g. "hola", "hora", "adi")
        if (words.length === 1 && (words[0].length < 3 || noiseTokens.has(words[0]))) {
          return false;
        }
        return true;
      };

      // En celulares el reconocimiento del navegador compite con Gemini por el micrófono;
      // ahí basta la transcripción que ya manda Gemini Live.
      const isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      let recognitionBroken = false;
      if (SpeechRecognitionClass && !isMobile) {
        try {
          const recognition = new SpeechRecognitionClass();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'es-MX';

          recognition.onstart = () => {
            setIsListeningSpeech(true);
          };

          recognition.onresult = (event: any) => {
            if (isSpeakingRef.current) return; // Ignore user mic if Adi is currently talking
            
            let interim = '';
            let finalSentence = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                finalSentence += event.results[i][0].transcript;
              } else {
                interim += event.results[i][0].transcript;
              }
            }

            const current = (finalSentence || interim).trim();
            if (current && isMeaningfulSpeech(current)) {
              markUserActivity();
              setUserTranscript(current);
              pendingTranscriptRef.current = current;

              if (isInitialGreetingDoneRef.current && USER_FAREWELL_REGEX.test(current)) {
                console.log('Despedida de usuario detectada en speechRecognition:', current);
                farewellDetectedRef.current = true;
              }
            }
          };

          recognition.onerror = (e: any) => {
            // Sin acceso al micrófono o sin servicio: no se reintenta en bucle
            if (['audio-capture', 'not-allowed', 'service-not-allowed', 'network'].includes(e.error)) recognitionBroken = true;
          };

          recognition.onend = () => {
            // Auto restart recognition if still connected
            if (!recognitionBroken && mediaStreamRef.current && activeSessionRef.current) {
              try { recognition.start(); } catch (_) {}
            } else {
              setIsListeningSpeech(false);
            }
          };

          recognition.start();
          speechRecognitionRef.current = recognition;
        } catch (err) {
          console.warn('Speech recognition setup note:', err);
        }
      }

      // Pre-calculated silent 16-bit PCM buffer (2048 samples = 4096 zero bytes)
      const silencePCMBase64 = arrayBufferToBase64(new ArrayBuffer(Math.round(4096 * 16000 / inputCtx.sampleRate) * 2));

      // Continuous PCM Audio Streaming Node with Intelligent Noise Gate / VAD
      const source = inputCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;
      
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      const inputRate = inputCtx.sampleRate;
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (isMutedRef.current || !activeSessionRef.current) return;
        
        // While Adi is speaking, stream silence packets to keep socket alive without acoustic feedback
        if (isSpeakingRef.current) {
          setIsUserSpeaking(false);
          isUserSpeakingRef.current = false;
          lastActivityTimeRef.current = Date.now();
          try {
            activeSessionRef.current.sendRealtimeInput({
              audio: {
                mimeType: 'audio/pcm;rate=16000',
                data: silencePCMBase64
              }
            });
          } catch (_) {}
          return;
        }

        const inputData = downsampleTo16k(e.inputBuffer.getChannelData(0), inputRate);
        
        // Voice Activity Detection (VAD): Calculate RMS energy
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        
        // Calibrated Voice Threshold:
        // Ambient room noise, breathing, fan, keyboard clicks are usually < 0.020.
        // Deliberate human voice is usually 0.022 - 0.20+.
        const VOICE_THRESHOLD = 0.022;

        if (rms > VOICE_THRESHOLD) {
          voiceHangoverRef.current = 4; // ~4 bloques (~340 ms a 48 kHz) de cola so trailing syllables aren't cut
          setIsUserSpeaking(true);
          isUserSpeakingRef.current = true;
          markUserActivity();
          const pcm16 = float32To16BitPCM(inputData); 
          const base64Data = arrayBufferToBase64(pcm16);
          try {
            activeSessionRef.current.sendRealtimeInput({
              audio: {
                mimeType: 'audio/pcm;rate=16000',
                data: base64Data
              }
            });
          } catch (_) {}
        } else if (voiceHangoverRef.current > 0) {
          voiceHangoverRef.current--;
          markUserActivity();
          // Send trailing speech cleanly
          const pcm16 = float32To16BitPCM(inputData); 
          const base64Data = arrayBufferToBase64(pcm16);
          try {
            activeSessionRef.current.sendRealtimeInput({
              audio: {
                mimeType: 'audio/pcm;rate=16000',
                data: base64Data
              }
            });
          } catch (_) {}
        } else {
          if (isUserSpeakingRef.current) {
            setIsUserSpeaking(false);
            isUserSpeakingRef.current = false;
          }

          // Stream silence packets so Gemini Live detects speech end boundary and stays connected
          try {
            activeSessionRef.current.sendRealtimeInput({
              audio: {
                mimeType: 'audio/pcm;rate=16000',
                data: silencePCMBase64
              }
            });
          } catch (_) {}
        }
      };

      // Connect through a zero-gain mute node to destination so processor runs without audio howling feedback
      const muteNode = inputCtx.createGain();
      muteNode.gain.value = 0;
      source.connect(processor);
      processor.connect(muteNode);
      muteNode.connect(inputCtx.destination);

    } catch (err) {
      console.error("Initialization failed", err);
      setIsError(true);
      setIsConnecting(false);
      setIsConnected(false);
    }
  };

  const disconnect = useCallback(() => {
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch (_) {}
      speechRecognitionRef.current = null;
    }
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    try {
      activeSessionRef.current?.close();
    } catch (e) {
      console.warn("Error closing session:", e);
    }

    scriptProcessorRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    
    // Stop microphone tracks so browser stops recording
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;

    try { inputAudioContextRef.current?.close(); } catch (_) {}
    try { audioContextRef.current?.close(); } catch (_) {}
    inputAudioContextRef.current = null;
    audioContextRef.current = null;
    outputAnalyserRef.current = null;
    sessionPromiseRef.current = null;
    newAdiTurnRef.current = true;
    newUserTurnRef.current = true;
    nextStartTimeRef.current = 0;
    
    sourcesRef.current.forEach(s => {
      try { s.stop(); } catch (_) {}
    });
    sourcesRef.current.clear();

    activeSessionRef.current = null;
    isSpeakingRef.current = false;
    isUserSpeakingRef.current = false;
    hasUserInteractedRef.current = false;
    isInitialGreetingDoneRef.current = false;
    farewellDetectedRef.current = false;
    isFarewellShutdownRef.current = false;
    currentAdiTurnTextRef.current = '';
    voiceHangoverRef.current = 0;
    setIsConnected(false);
    setIsConnecting(false);
    setIsSpeaking(false);
    setIsUserSpeaking(false);
    setIsListeningSpeech(false);
    setIsFarewellClosing(false);
  }, []);

  disconnectRef.current = disconnect;

  const toggleMute = () => {
    setIsMuted(prev => {
      isMutedRef.current = !prev;
      return !prev;
    });
  };

  const forceSubmitPendingSpeech = () => {
    if (pendingTranscriptRef.current) {
      const text = pendingTranscriptRef.current;
      pendingTranscriptRef.current = '';
      sendUserQuestion(text);
    } else if (userTranscript) {
      sendUserQuestion(userTranscript);
    }
  };

  useEffect(() => {
    return () => {
      disconnect();
      if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
    };
  }, [disconnect]);

  // Watchdog: Turns off Adi only after the user stops interacting
  useEffect(() => {
    if (!isConnected) return;

    const interval = window.setInterval(() => {
      // While speaking (either user or Adi) or shutting down, keep activity time refreshed
      if (isSpeakingRef.current || isUserSpeakingRef.current || isFarewellShutdownRef.current) {
        lastActivityTimeRef.current = Date.now();
        return;
      }

      const idleMs = Date.now() - lastActivityTimeRef.current;

      // 1. If user has interacted, turn off after 20s of continuous silence/inactivity
      if (hasUserInteractedRef.current && idleMs > 20000) {
        console.log('Interacción terminada. Apagando asistente tras 20s sin interacción.');
        disconnectRef.current();
      }
      // 2. If user never interacted after welcome, allow 60s grace period before turning off
      else if (!hasUserInteractedRef.current && idleMs > 60000) {
        console.log('Sin interacción tras bienvenida. Apagando asistente tras 60s.');
        disconnectRef.current();
      }
    }, 1500);

    // Also auto-turn off if tab is placed in background for >15s
    let tabHiddenTimer: number | null = null;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        tabHiddenTimer = window.setTimeout(() => {
          disconnectRef.current();
        }, 15000);
      } else if (tabHiddenTimer) {
        window.clearTimeout(tabHiddenTimer);
        tabHiddenTimer = null;
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      if (tabHiddenTimer) window.clearTimeout(tabHiddenTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isConnected]);

  const getLevel = useCallback(() => {
    const an = outputAnalyserRef.current;
    const buf = levelBufRef.current;
    if (!an || !buf) return 0;
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
    return Math.sqrt(sum / buf.length);
  }, []);

  const orbMode: OrbMode = !isConnected ? 'idle' : isSpeaking ? 'speaking' : isUserSpeaking ? 'user' : 'listening';

  const statusLabel = isSpeaking ? 'Adi está hablando' : isUserSpeaking ? 'La escucho…' : 'Escuchando · hable con naturalidad';

  return (
    <div className="w-full flex flex-col items-center justify-center pt-5">
      {/* Avatar circular */}
      <div className="relative">
        <div
          className={`absolute -inset-2 rounded-full spectrum-bar blur-lg transition-opacity duration-700 ${isSpeaking ? 'opacity-50' : 'opacity-20'}`}
          aria-hidden="true"
        />
        <div className="relative w-60 h-60 sm:w-72 sm:h-72 rounded-full border-4 border-white bg-cream overflow-hidden shadow-xl z-10">
          <PaintOrb mode={orbMode} getLevel={getLevel} />
          {!isConnected && (
            <div className="absolute inset-0 z-20 flex items-center justify-center">
              <button
                type="button"
                onClick={initializeAudio}
                disabled={isConnecting}
                className="group flex flex-col items-center justify-center w-full h-full disabled:pointer-events-none"
              >
                <span className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  {isConnecting ? <Activity className="w-7 h-7 text-plum animate-spin" /> : <Mic className="w-7 h-7 text-plum" />}
                </span>
                <span className="mt-3 text-ink bg-white/85 rounded-full px-3 py-1 font-extrabold text-sm tracking-wide">
                  {isConnecting ? 'Conectando con Adi…' : isError ? 'Reintentar' : 'Hablar con Adi'}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {isError && !isConnected && (
        <p className="mt-3 text-sm font-bold text-wine">No pudimos conectar el micrófono. Revise los permisos e intente de nuevo.</p>
      )}

      {/* Subtítulos y estado */}
      {isConnected && (
        <div className="w-full max-w-md mt-4 px-2" aria-live="polite">
          {isSpeaking || isFarewellClosing ? (
            <div className="card rounded-2xl p-3.5 text-center">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-plum mb-1">
                {isFarewellClosing ? 'Adi se despide' : 'Adi'}
              </p>
              <p className="text-sm font-semibold leading-relaxed">{adiTranscript || '…'}</p>
            </div>
          ) : userTranscript ? (
            <div className="card rounded-2xl p-3 flex items-center gap-3 text-left">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-leaf">Usted dijo</p>
                <p className="text-sm font-semibold line-clamp-2">{userTranscript}</p>
              </div>
              <button
                type="button"
                onClick={forceSubmitPendingSpeech}
                className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-ink text-white text-xs font-extrabold"
              >
                <Send className="w-3.5 h-3.5" /> Preguntar
              </button>
            </div>
          ) : (
            <p className="text-center text-sm font-bold text-muted inline-flex w-full justify-center items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isUserSpeaking ? 'bg-leaf animate-ping' : 'bg-line'}`} />
              {statusLabel}
            </p>
          )}
        </div>
      )}

      {/* Controles */}
      {isConnected && (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={toggleMute}
            aria-pressed={isMuted}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full border text-sm font-extrabold transition ${
              isMuted ? 'bg-[#FBE9EA] border-wine text-wine' : 'bg-white border-line hover:border-plum'
            }`}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {isMuted ? 'Micrófono en silencio' : 'Micrófono activo'}
          </button>
          <button
            type="button"
            onClick={disconnect}
            title="Terminar conversación"
            aria-label="Terminar conversación"
            className="w-11 h-11 flex items-center justify-center rounded-full bg-white border border-line text-muted hover:border-wine hover:text-wine transition"
          >
            <Power className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default AdiAssistant;
