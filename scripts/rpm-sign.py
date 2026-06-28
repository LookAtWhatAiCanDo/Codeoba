import os
import pty
import sys

def sign_rpm(rpm_file, passphrase):
    sys.stderr.write(f"[rpm-sign.py] Spawning pty.fork() to sign: {rpm_file}\n")
    sys.stderr.flush()
    
    pid, fd = pty.fork()
    
    if pid == 0:
        # Child process: Replace this process with the rpmsign command
        os.execvp("rpm", ["rpm", "--addsign", rpm_file])
    else:
        # Parent process: Communicate with child through the master PTY (fd)
        
        # Disable echo to prevent the passphrase from being leaked/echoed in logs
        try:
            import termios
            attr = termios.tcgetattr(fd)
            attr[3] &= ~termios.ECHO
            termios.tcsetattr(fd, termios.TCSANOW, attr)
            sys.stderr.write("[rpm-sign.py] Successfully disabled PTY echoing.\n")
            sys.stderr.flush()
        except Exception as e:
            sys.stderr.write(f"[rpm-sign.py] Warning: Could not disable PTY echo: {e}\n")
            sys.stderr.flush()
            
        # Write the passphrase immediately to the PTY input buffer.
        # This satisfies getpass() whether it reads from /dev/tty or falls back to stdin.
        sys.stderr.write("[rpm-sign.py] Writing passphrase to PTY input buffer...\n")
        sys.stderr.flush()
        os.write(fd, passphrase.encode() + b"\n")
        
        output = b""
        while True:
            try:
                # Read output from child
                chunk = os.read(fd, 1024)
                if not chunk:
                    sys.stderr.write("[rpm-sign.py] EOF reached on PTY descriptor.\n")
                    sys.stderr.flush()
                    break
                
                # Print stdout to the runner console so we see the build output
                sys.stdout.buffer.write(chunk)
                sys.stdout.flush()
                
                output += chunk
                
                # Check for overwrite prompts (e.g. from GPG when signature file exists)
                if b"Overwrite?" in output or b"y/N" in output:
                    sys.stderr.write("[rpm-sign.py] Overwrite prompt detected! Sending 'y' to PTY...\n")
                    sys.stderr.flush()
                    os.write(fd, b"y\n")
                    output = b"" # clear buffer
            except OSError as e:
                sys.stderr.write(f"[rpm-sign.py] PTY Read Error: {e}\n")
                sys.stderr.flush()
                break
                
        # Wait for the child to exit
        sys.stderr.write("[rpm-sign.py] Waiting for child process to terminate...\n")
        sys.stderr.flush()
        _, status = os.waitpid(pid, 0)
        
        # Extract exit code
        if os.WIFEXITED(status):
            code = os.WEXITSTATUS(status)
            sys.stderr.write(f"[rpm-sign.py] Child exited with code: {code}\n")
            sys.stderr.flush()
            return code
        else:
            sys.stderr.write("[rpm-sign.py] Child process killed or failed to exit normally.\n")
            sys.stderr.flush()
            return 1 # failed or killed

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: rpm-sign.py <rpm_file> <passphrase>")
        sys.exit(1)
    
    rpm_file = sys.argv[1]
    passphrase = sys.argv[2]
    
    exit_code = sign_rpm(rpm_file, passphrase)
    sys.exit(exit_code)
