
chr = 'a'
f = nil

ARGF.each_line.with_index do |line, i|
  if i % 10000 == 0
    if f
      puts 'json/' + (chr) + '.json'
      f.puts(']')
      f.close
      chr = chr.next
    end
    f = File.open('json/' + (chr) + '.json', 'w')
    f.puts('[')
  else
    f.puts(',')
  end

  f.write(File.read(line.strip))
end

if f
  puts 'json/' + (chr) + '.json'
  f.puts(']')
  f.close
end
