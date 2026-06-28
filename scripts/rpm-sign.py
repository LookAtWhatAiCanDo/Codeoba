import os
import pty
import sys
import subprocess

def sign_rpm(rpm_file, passphrase):
    # Create a pseudo-terminal
    master_fd, slave_fd = pty.openpty()
    
    # Start the rpmsign command
    cmd = ["rpm", "--addsign", rpm_file]
    
    # Pass the slave_fd as stdin/stdout/stderr to the subprocess
    process = subprocess.Popen(
        cmd,
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        close_fds=True
    )
    
    # Close the slave descriptor in the parent
    os.close(slave_fd)
    
    # Read from master_fd to detect prompt and print stdout to runner console
    output = b""
    passphrase_sent = False
    while True:
        try:
            chunk = os.read(master_fd, 1024)
            if not chunk:
                break
            # Print the output from the process to standard output
            sys.stdout.buffer.write(chunk)
            sys.stdout.flush()
            
            output += chunk
            if not passphrase_sent and b"Enter pass phrase:" in output:
                # Write passphrase followed by newline
                os.write(master_fd, passphrase.encode() + b"\n")
                passphrase_sent = True
                output = b"" # clear buffer
        except OSError:
            break
            
    process.wait()
    return process.returncode

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: rpm-sign.py <rpm_file> <passphrase>")
        sys.exit(1)
    
    rpm_file = sys.argv[1]
    passphrase = sys.argv[2]
    
    exit_code = sign_rpm(rpm_file, passphrase)
    sys.exit(exit_code)
