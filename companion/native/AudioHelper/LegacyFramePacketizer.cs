using System.Buffers.Binary;

static class LegacyFramePacketizer
{
    public static void WriteStdoutFrame(Stream stdout, byte[] prefix, byte[] frame)
    {
        BinaryPrimitives.WriteUInt16LittleEndian(prefix, (ushort)frame.Length);
        stdout.Write(prefix);
        stdout.Write(frame);
        stdout.Flush();
    }

    public static bool WriteFastHidFragments(
        byte[] frame,
        ushort sequence,
        byte[] hidReport,
        Func<byte[], bool> writeReport,
        out int fragmentCount
    )
    {
        fragmentCount = (frame.Length + AudioConstants.FastPayloadBytes - 1) / AudioConstants.FastPayloadBytes;
        var fragmentIndex = 0;
        for (var offset = 0; offset < frame.Length; offset += AudioConstants.FastPayloadBytes)
        {
            Array.Clear(hidReport);
            var payloadLength = Math.Min(AudioConstants.FastPayloadBytes, frame.Length - offset);
            hidReport[0] = AudioConstants.LegacyAudioStreamReportId;
            hidReport[1] = AudioConstants.FastFrameFragmentType;
            hidReport[2] = (byte)(sequence & 0xff);
            hidReport[3] = (byte)(sequence >> 8);
            hidReport[4] = (byte)fragmentIndex;
            hidReport[5] = (byte)fragmentCount;
            hidReport[6] = (byte)payloadLength;
            Buffer.BlockCopy(frame, offset, hidReport, 7, payloadLength);
            if (!writeReport(hidReport))
            {
                return false;
            }
            fragmentIndex++;
        }
        return true;
    }
}
